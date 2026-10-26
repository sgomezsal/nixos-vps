import * as pulumi from "@pulumi/pulumi";
import * as hcloud from "@pulumi/hcloud";
import { local } from "@pulumi/command";
import * as path from "node:path";
import * as fs from "node:fs";
import * as crypto from "node:crypto";
import * as net from "node:net";

export interface NixosServerArgs {
  /** Local flake directory. Must contain flake.lock; commit it for reproducibility. */
  flakeDirectory: string;
  /** Attribute under nixosConfigurations, e.g. "web". */
  configuration: string;
  /** A pinned installer flake package, e.g. "/checkout/platform#nixos-anywhere". */
  installer: string;
  /** Deployment authentication paths; this private key stays local, outside state. */
  sshPublicKeyPath: string;
  sshPrivateKeyPath: string;
  /** Separate Ed25519 server identity; secret cloud-init user-data and encrypted state. Keep outside the project. */
  sshHostKeyPrivatePath: string;
  expectedDisk?: string;
  expectedDiskSerial?: string;
  /** Existing Hetzner SSH key IDs avoid duplicate-fingerprint registration. */
  existingSshKeyIds?: pulumi.Input<pulumi.Input<string>[]>;
  serverType?: pulumi.Input<string>;
  location?: pulumi.Input<string>;
  bootstrapImage?: pulumi.Input<string>;
  /** Restricts SSH at the cloud firewall. Must include the deployment runner. */
  sshSourceIps?: pulumi.Input<pulumi.Input<string>[]>;
  /** Additional inbound TCP ports; NixOS must allow them too. CLI --fix updates only the bundled public port file. */
  tcpPorts?: readonly number[];
  labels?: pulumi.Input<Record<string, pulumi.Input<string>>>;
  /** How long to wait for SSH before and after installation, in seconds. */
  sshTimeoutSeconds?: number;
}

function quote(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

/** Provisions a new x86_64 IPv4 VPS and performs its initial NixOS installation.
 * Subsequent configuration changes belong to nixos-rebuild, never this installer.
 */
export class NixosServer extends pulumi.ComponentResource {
  public readonly preflight: local.Command;
  public readonly sshKey?: hcloud.SshKey;
  public readonly firewall: hcloud.Firewall;
  public readonly server: hcloud.Server;
  public readonly installation: local.Command;
  /** Resolves after the installer and the post-install SSH check succeed. */
  public readonly ipv4: pulumi.Output<string>;
  public readonly serverId: pulumi.Output<string>;

  constructor(name: string, args: NixosServerArgs, opts?: pulumi.ComponentResourceOptions) {
    for (const field of ["flakeDirectory", "configuration", "installer", "sshPublicKeyPath", "sshPrivateKeyPath", "sshHostKeyPrivatePath"] as const) {
      if (!args[field]?.trim()) throw new Error(`${field} must not be empty`);
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(args.configuration)) {
      throw new Error("configuration must be a simple nixosConfigurations attribute name");
    }
    if (typeof args.serverType === "string" && !/^(cx|cpx|ccx)\d+$/.test(args.serverType)) {
      throw new Error("serverType must be an x86_64 CX, CPX or CCX plan; CAX/ARM is unsupported");
    }
    if (Array.isArray(args.existingSshKeyIds) && args.existingSshKeyIds.length === 0) {
      throw new Error("existingSshKeyIds must not be empty; omit it to register the deployment public key");
    }
    if (Array.isArray(args.sshSourceIps) && args.sshSourceIps.length === 0) {
      throw new Error("sshSourceIps must include the deployment runner; an empty list blocks installation");
    }
    const ports = [...new Set(args.tcpPorts ?? [])];
    if (ports.some(port => !Number.isInteger(port) || port < 1 || port > 65535)) {
      throw new Error("tcpPorts must contain integers between 1 and 65535");
    }
    const timeout = args.sshTimeoutSeconds ?? 600;
    if (!Number.isInteger(timeout) || timeout < 1 || timeout > 3600) {
      throw new Error("sshTimeoutSeconds must be an integer between 1 and 3600");
    }
    super("nixos-vps:hetzner:NixosServer", name, {}, opts);
    const serverType = pulumi.output(args.serverType ?? "cpx22");
    const sshSources = pulumi.output(args.sshSourceIps ?? ["0.0.0.0/0", "::/0"]);
    const existingIds = args.existingSshKeyIds === undefined ? undefined : pulumi.output(args.existingSshKeyIds);
    const location = pulumi.output(args.location ?? "nbg1");
    const image = pulumi.output(args.bootstrapImage ?? "ubuntu-24.04");
    // Report deferred validation through the preflight command. Throwing inside an
    // Output.apply can strand pending resource registrations in the Node runtime.
    const inputError = pulumi.all([serverType, sshSources, existingIds ?? [], location, image]).apply(([plan, sources, ids, region, bootstrap]) => {
      if (typeof plan !== "string" || !/^(cx|cpx|ccx)\d+$/.test(plan)) return "serverType must be an x86_64 CX, CPX or CCX plan; CAX/ARM is unsupported";
      if (!Array.isArray(sources) || sources.length === 0) return "sshSourceIps must not be empty";
      for (const value of sources) {
        if (typeof value !== "string") return "sshSourceIps must contain valid IP addresses or CIDRs";
        const [ip, prefix, extra] = value.split("/"); const family = net.isIP(ip);
        if (!family || extra !== undefined || (prefix !== undefined && (!/^\d+$/.test(prefix) || Number(prefix) > (family === 4 ? 32 : 128)))) return "sshSourceIps must contain valid IP addresses or CIDRs";
      }
      if (args.existingSshKeyIds !== undefined && (!Array.isArray(ids) || ids.length === 0 || ids.some(id => typeof id !== "string" || !/^\d+$/.test(id)))) return "existingSshKeyIds must contain nonempty numeric Hetzner key IDs";
      if (typeof region !== "string" || !/^[a-z]{3}\d+$/.test(region)) return "location must be a Hetzner location code, e.g. nbg1";
      if (typeof bootstrap !== "string" || !/^(ubuntu|debian)-\d+(?:\.\d+)?$/.test(bootstrap)) return "bootstrapImage must be an Ubuntu or Debian image name";
      return "";
    });
    const childOpts: pulumi.CustomResourceOptions = { parent: this };
    const runner = path.resolve(__dirname, "../scripts/runner.cjs");
    const environment = {
      NIXOS_FLAKE_DIRECTORY: path.resolve(args.flakeDirectory),
      NIXOS_CONFIGURATION: args.configuration,
      NIXOS_INSTALLER: args.installer,
      NIXOS_PUBLIC_KEY_PATH: path.resolve(args.sshPublicKeyPath),
      NIXOS_PRIVATE_KEY_PATH: path.resolve(args.sshPrivateKeyPath),
      NIXOS_HOST_KEY_PATH: path.resolve(args.sshHostKeyPrivatePath),
      NIXOS_EXPECTED_DISK: args.expectedDisk ?? "/dev/sda",
      NIXOS_EXPECTED_DISK_SERIAL: args.expectedDiskSerial ?? "",
      NIXOS_TCP_PORTS: JSON.stringify(ports),
      // All deferred input validation must resolve BEFORE any preflight/provider operation.
      NIXOS_INPUT_ERROR: inputError,
      NIXOS_SSH_TIMEOUT: String(timeout),
    };
    const command = (phase: string) => `${quote(process.execPath)} ${quote(runner)} ${phase}`;
    this.preflight = new local.Command(`${name}-preflight`, {
      create: command("preflight"), update: command("preflight"), environment,
      addPreviousOutputInEnv: false,
      logging: local.Logging.None,
    }, childOpts);
    const userData = pulumi.secret(this.preflight.stdout.apply(value => {
      const checked = JSON.parse(value) as { hostPublicKey: string; hostKeyDigest: string };
      const privateKey = fs.readFileSync(path.resolve(args.sshHostKeyPrivatePath), "utf8");
      if (crypto.createHash("sha256").update(privateKey).digest("hex") !== checked.hostKeyDigest) throw new Error("Host key changed since preflight; refusing to provision an unverified identity");
      return "#cloud-config\n" + JSON.stringify({ disable_root: false, ssh_pwauth: false, ssh_deletekeys: true, ssh_genkeytypes: [],
        ssh_keys: { ed25519_private: privateKey, ed25519_public: checked.hostPublicKey } });
    }));

    if (args.existingSshKeyIds === undefined) {
      // Preflight returns only the public key; no local file read during preview.
      this.sshKey = new hcloud.SshKey(`${name}-ssh`, {
        publicKey: this.preflight.stdout.apply(value => {
          const result = JSON.parse(value) as { publicKey: string };
          return result.publicKey;
        }),
      }, childOpts);
    }
    this.firewall = new hcloud.Firewall(`${name}-firewall`, {
      rules: [
        { direction: "in", protocol: "tcp", port: "22", sourceIps: sshSources },
        ...ports.filter(port => port !== 22).map(port => ({
          direction: "in", protocol: "tcp", port: String(port), sourceIps: ["0.0.0.0/0", "::/0"],
        })),
      ],
    }, { ...childOpts, dependsOn: [this.preflight] });
    this.server = new hcloud.Server(`${name}-server`, {
      serverType,
      image,
      location,
      userData,
      sshKeys: existingIds ?? [this.sshKey!.id],
      firewallIds: [this.firewall.id.apply(Number)],
      publicNets: [{ ipv4Enabled: true, ipv6Enabled: true }],
      labels: args.labels,
    }, { ...childOpts, dependsOn: [this.preflight] });
    this.installation = new local.Command(`${name}-install`, {
      create: command("install"),
      // Nonempty update prevents command provider from falling back to create.
      update: command("update"),
      environment: { ...environment, NIXOS_TARGET: this.server.ipv4Address },
      triggers: [this.server.id],
      addPreviousOutputInEnv: false,
      logging: local.Logging.None,
    }, {
      ...childOpts,
      // Reinstall only when the actual VM changes, never on flake/path edits.
      replaceOnChanges: ["triggers"],
      customTimeouts: { create: "60m", update: "1m" },
      additionalSecretOutputs: ["stdout", "stderr"],
    });
    this.ipv4 = pulumi.all([this.server.ipv4Address, this.installation.id]).apply(([ip]) => ip);
    this.serverId = this.server.id;
    this.registerOutputs({ ipv4: this.ipv4, serverId: this.serverId });
  }
}
