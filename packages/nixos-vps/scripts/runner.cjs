#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

// Cloud credentials are for the provider, never Nix builds or SSH processes.
function childEnvironment(env) {
  const names = ["PATH", "HOME", "USER", "LOGNAME", "TMPDIR", "SSH_AUTH_SOCK",
    "NIX_CONFIG", "NIX_REMOTE", "NIX_SSL_CERT_FILE", "SSL_CERT_FILE", "XDG_CACHE_HOME", "LANG", "NIXOS_KNOWN_HOSTS"];
  return Object.fromEntries(names.filter(name => env[name] !== undefined).map(name => [name, env[name]]));
}
function settings(env) {
  const required = name => {
    if (!env[name]?.trim()) throw new Error(`Missing ${name}`);
    return env[name];
  };
  const directory = required("NIXOS_FLAKE_DIRECTORY");
  const configuration = required("NIXOS_CONFIGURATION");
  if (!/^[a-zA-Z0-9_-]+$/.test(configuration)) throw new Error("Invalid configuration name");
  const installer = required("NIXOS_INSTALLER");
  const publicKeyPath = required("NIXOS_PUBLIC_KEY_PATH");
  const privateKeyPath = required("NIXOS_PRIVATE_KEY_PATH");
  const hostKeyPrivatePath = required("NIXOS_HOST_KEY_PATH");
  const expectedDisk = env.NIXOS_EXPECTED_DISK ?? "/dev/sda";
  if (!/^\/dev\/(?:sd[a-z]|vd[a-z]|nvme\d+n\d+)$/.test(expectedDisk)) throw new Error("expectedDisk must name a single whole disk, not a partition or shell expression");
  const timeout = Number(env.NIXOS_SSH_TIMEOUT ?? "600");
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 3600) throw new Error("Invalid SSH timeout");
  return { directory, configuration, installer, publicKeyPath, privateKeyPath, hostKeyPrivatePath, expectedDisk,
    expectedDiskSerial: env.NIXOS_EXPECTED_DISK_SERIAL || undefined, timeout, tcpPorts: JSON.parse(env.NIXOS_TCP_PORTS || "[]") };
}
function failure(binary, args, status, stderr = "") {
  let code = "COMMAND_FAILED", advice = "Check PATH and the documented prerequisites.";
  if (binary === "ssh") {
    if (/REMOTE HOST IDENTIFICATION HAS CHANGED|Host key verification failed|No .* host key is known/.test(stderr)) {code="SSH_HOST_IDENTITY";advice="The server identity does not match the pinned Ed25519 host key, or no trusted key is available. Verify cloud-init and the dedicated host key through a trusted channel. Do not disable host verification.";}
    else if (/Permission denied|no mutual signature|sign_and_send_pubkey/.test(stderr)) {code="SSH_AUTHENTICATION";advice="Public-key authentication failed. Check the deployment private key, root authorized_keys and root SSH policy; the host identity key is not the login key.";}
    else if (/Connection refused/.test(stderr)) {code="SSH_REFUSED";advice="Port 22 refused the connection. Wait for sshd/cloud-init or check the server through trusted console/rescue access.";}
    else if (/timed out|No route to host|Network is unreachable/.test(stderr)) {code="SSH_NETWORK";advice="SSH is unreachable. Check public IPv4, TCP/22 firewall rules, sshSourceIps and the deployment runner's network.";}
    else if (/Could not resolve hostname/.test(stderr)) {code="SSH_DNS";advice="SSH hostname resolution failed. Check the target address and local DNS.";}
    else {code="SSH_REMOTE_COMMAND";advice="SSH or the remote readiness command failed. Inspect OS, sshd and disk tools through a trusted channel.";}
  } else if (binary === "nix") {
    code="NIX_FAILED";
    const target=args.find(value=>value.includes("#"));
    const quote=value=>"'"+value.replace(/'/g,"'\\''")+"'";
    advice=target ? `For full diagnostics in a controlled terminal run: nix ${args[0]} --no-update-lock-file ${quote(target)} --show-trace. Detailed Nix logs may contain application secrets; do not publish them.` : "Check Nix installation, flakes support, the lockfile and public cache connectivity.";
    if (/hash mismatch/.test(stderr)) advice="A pinned source hash did not match. Do not bypass the checksum; review the pinned input/payload before deliberately updating it. "+advice;
    else if (/experimental feature.*disabled/.test(stderr)) advice="Enable nix-command and flakes in Nix configuration. "+advice;
    else if (/No space left on device/.test(stderr)) advice="The local Nix build ran out of disk space. Free space before retrying. "+advice;
  } else if (binary.endsWith("/bin/nixos-anywhere")) {
    code="INSTALL_PHASE_FAILED";advice=`Installation phase ${args.at(-1)} failed. Inspect the target through trusted console/rescue access. If it is NixOS or the RAM installer, do not retry disk formatting; follow the recovery instructions.`;
  }
  const error = new Error(`${code}: ${binary === "ssh" ? "ssh" : binary === "nix" ? "nix "+args[0] : binary} failed (exit ${status ?? "signal"}). ${advice}`);
  error.code=code;
  return error;
}
function run(binary, args, options = {}) {
  // Suppress raw build/install logs. Capture bounded stderr only for sanitized
  // classification; selected callers capture stdout for immutable store paths.
  // Never emit raw child diagnostics or persist them in Pulumi state.
  const quiet = (binary === "nix" && ["build", "run"].includes(args[0])) || binary.endsWith("/bin/nixos-anywhere");
  const result = spawnSync(binary, args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
    ...(quiet ? { stdio: ["ignore", "ignore", "pipe"] } : {}),
    timeout: 45 * 60 * 1000, ...options });
  if (result.error) throw new Error(`Unable to execute ${binary}: ${result.error.code ?? result.error.message}. Check PATH and the documented prerequisites; ETIMEDOUT means the operation exceeded its time limit.`);
  if (result.status !== 0) {
    // Never persist subprocess output, which can contain decrypted service secrets.
    throw failure(binary, args, result.status, result.stderr || "");
  }
  return (result.stdout || (binary === "ssh" && args[0] === "-V" ? result.stderr : ""))?.trim() ?? "";
}
function keyIdentity(key) { return key.trim().split(/\s+/).slice(0, 2).join(" "); }
function keyFile(filename, directory, io = fs) {
  try { io.accessSync(filename, fs.constants.R_OK); }
  catch { throw new Error("SSH_KEY_FILE: private key is missing or unreadable. Check sshPrivateKeyPath/sshHostKeyPrivatePath in the stack file. Initialize new projects with nixos-vps init; never regenerate an existing server identity to fix a path error."); }
  const real = io.realpathSync(filename);
  if (real.startsWith(io.realpathSync(directory) + path.sep) || path.resolve(filename).startsWith(path.resolve(directory) + path.sep)) throw new Error("Keep SSH private keys outside flakeDirectory so Nix cannot copy them into the store");
  if ((io.statSync(real).mode & 0o077) !== 0) throw new Error("SSH private key permissions must be 0600 or stricter; run chmod 600 on the key");
  return real;
}
function digest(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }
function verifyInstaller(root, io = fs) {
  let manifest;
  try { manifest = JSON.parse(io.readFileSync(path.join(root, "share/nixos-installer-security.json"), "utf8")); }
  catch { throw new Error("INSTALLER_MANIFEST: secure installer metadata is missing or invalid. Use the bundled nixos-anywhere package from secure-installer.nix; an unpatched upstream installer is not supported."); }
  if (manifest.securityVersion !== 1 || manifest.driver !== "bin/.nixos-anywhere-wrapped") throw new Error("A secure known-hosts-v1 installer is required; use the packaged secure-installer.nix");
  const driver = io.readFileSync(path.join(root, manifest.driver));
  if (digest(driver) !== manifest.driverSha256 || !driver.toString().includes("StrictHostKeyChecking=yes") || driver.toString().includes("StrictHostKeyChecking=no")) throw new Error("Installer driver integrity/strict host verification check failed");
  if (typeof manifest.kexecPath !== "string" || digest(io.readFileSync(manifest.kexecPath)) !== manifest.kexecSha256) throw new Error("Pinned kexec payload integrity check failed");
  return root;
}
function strictSshArgs(config, knownHosts, target, port = 22) {
  return ["-F", "/dev/null", "-i", config.privateKeyPath, "-p", String(port),
    "-o", "IdentitiesOnly=yes", "-o", "IdentityAgent=none", "-o", "ForwardAgent=no", "-o", "BatchMode=yes",
    "-o", "ConnectTimeout=10", "-o", "StrictHostKeyChecking=yes", "-o", "GlobalKnownHostsFile=/dev/null",
    "-o", "HostKeyAlgorithms=ssh-ed25519", "-o", "UpdateHostKeys=no", "-o", "VerifyHostKeyDNS=no",
    "-o", `UserKnownHostsFile=${knownHosts}`, target];
}
function validateDisk(layout, config, previous, requireRoot = true) {
  if (!layout || !Array.isArray(layout.blockdevices)) throw new Error("Disk safety check: lsblk did not return a valid disk inventory. Inspect lsblk through trusted console access; no formatting was authorized.");
  const disks = (layout.blockdevices ?? []).filter(d => d.type === "disk");
  if (disks.length !== 1) throw new Error(`Disk safety check: exactly one physical disk is supported (found ${disks.length}); detach data volumes before installation. No formatting was authorized.`);
  const disk = disks[0];
  const mounted = d => (d.mountpoints ?? []).includes("/") || (d.children ?? []).some(mounted);
  if (disk.path !== config.expectedDisk) throw new Error(`Disk safety check: expected whole disk ${config.expectedDisk} is absent or does not match. Inspect lsblk through trusted access and align expectedDisk with disko; do not bypass the guard.`);
  if (!Number.isSafeInteger(Number(disk.size)) || Number(disk.size) < 1024 ** 3) throw new Error("Disk safety check: disk size is missing, invalid or smaller than 1 GiB. Inspect lsblk before retrying.");
  if (typeof disk.serial !== "string" || !disk.serial.trim()) throw new Error("Disk safety check: a nonempty physical disk serial is required to identify the same disk across kexec. No formatting was authorized; inspect disk identity through trusted access. Devices without a stable serial are unsupported.");
  if (config.expectedDiskSerial && disk.serial !== config.expectedDiskSerial) throw new Error("Disk safety check: serial mismatch. Verify the intended disk through trusted access; no formatting was authorized.");
  if (requireRoot && !mounted(disk)) throw new Error("Disk safety check: bootstrap root is not on the configured disk");
  if (previous && ["path", "serial", "size"].some(key => String(disk[key] ?? "") !== String(previous[key] ?? ""))) throw new Error("Disk safety check: disk identity changed across kexec");
  return { path: disk.path, serial: disk.serial, size: disk.size };
}
function diskInventory(output) {
  try { return JSON.parse(output); }
  catch { throw new Error("Disk safety check: lsblk returned invalid JSON. Check util-linux/lsblk support through trusted console access; no formatting was authorized."); }
}
function checkTools(execute) {
  if (Number(process.versions.node.split(".")[0]) < 22) throw new Error("Node.js >=22 is required");
  const nix = execute("nix", ["--version"]).match(/\b(\d+)\.(\d+)(?:\.\d+)?/);
  if (!nix || Number(nix[1]) < 2 || (Number(nix[1]) === 2 && Number(nix[2]) < 24)) {
    throw new Error("Nix >=2.24 with nix-command and flakes enabled is required");
  }
  const ssh = execute("ssh", ["-V"]).match(/OpenSSH_(\d+)\./);
  if (!ssh || Number(ssh[1]) < 9) throw new Error("OpenSSH >=9 is required (ssh and ssh-keygen)");
}
function validateSshPolicy(summary) {
  if (summary.passwordAuthentication !== false || summary.kbdInteractiveAuthentication !== false || summary.pubkeyAuthentication !== true || summary.authenticationMethods !== "publickey" || !["prohibit-password", "without-password"].includes(summary.rootLogin)) {
    throw new Error('SSH_AUTH_POLICY: configure services.openssh.settings with PasswordAuthentication=false, KbdInteractiveAuthentication=false, PubkeyAuthentication=true, AuthenticationMethods="publickey" and PermitRootLogin="prohibit-password". Password, interactive and alternative authentication are unsupported during initial provisioning. No provisioning was authorized.');
  }
  const manualDirective = /^\s*(?:PasswordAuthentication|KbdInteractiveAuthentication|ChallengeResponseAuthentication|PubkeyAuthentication|AuthenticationMethods|PermitRootLogin|Match|Include)\b/im;
  if (typeof summary.extraSshConfig !== "string" || !Array.isArray(summary.sshSettingNames) || manualDirective.test(summary.extraSshConfig) || summary.sshSettingNames.some(name => /^(?:Match|Include|ChallengeResponseAuthentication)(?:\s|$)/i.test(name))) {
    throw new Error('SSH_AUTH_OVERRIDES: raw authentication directives, Match blocks and Include files are unsupported during initial provisioning because they can override the verified policy. Use canonical services.openssh.settings options. No provisioning was authorized.');
  }
}
function preflight(config, execute, io = fs) {
  checkTools(execute);
  for (const filename of ["flake.nix", "flake.lock"]) {
    if (!io.existsSync(path.join(config.directory, filename))) throw new Error(`Missing ${filename} in flakeDirectory`);
  }
  const lock = JSON.parse(io.readFileSync(path.join(config.directory, "flake.lock"), "utf8"));
  if (!lock.nodes || !lock.root) throw new Error("Invalid flake.lock");
  const publicKey = io.readFileSync(config.publicKeyPath, "utf8").trim();
  if (!/^ssh-ed25519 [A-Za-z0-9+/]+={0,2}(?:\s|$)/.test(publicKey)) throw new Error("An Ed25519 SSH public key is required");
  keyFile(config.privateKeyPath, config.directory, io);
  keyFile(config.hostKeyPrivatePath, config.directory, io);
  if (io.realpathSync(config.privateKeyPath) === io.realpathSync(config.hostKeyPrivatePath)) throw new Error("Use a dedicated server host key, separate from the deployment client key");
  const hostPublicKey = keyIdentity(execute("ssh-keygen", ["-y", "-P", "", "-f", config.hostKeyPrivatePath]));
  if (!hostPublicKey.startsWith("ssh-ed25519 ")) throw new Error("Dedicated Ed25519 host key required");
  const derivedKey = execute("ssh-keygen", ["-y", "-P", "", "-f", config.privateKeyPath]);
  if (keyIdentity(derivedKey) !== keyIdentity(publicKey)) throw new Error("SSH private and public keys do not match");
  if (hostPublicKey === keyIdentity(derivedKey)) throw new Error("Use a dedicated server host key with different key material from the deployment client key");
  const flake = `${config.directory}#nixosConfigurations.${config.configuration}`;
  const summary = JSON.parse(execute("nix", ["eval", "--json", "--no-update-lock-file", flake, "--apply",
    'n: let c = n.config; in { system = n.pkgs.stdenv.hostPlatform.system; ssh = c.services.openssh.enable; ports = c.services.openssh.ports; firewall = c.networking.firewall.enable; tcpPorts = c.networking.firewall.allowedTCPPorts; tcpRanges = c.networking.firewall.allowedTCPPortRanges; rootLogin = c.services.openssh.settings.PermitRootLogin; passwordAuthentication = c.services.openssh.settings.PasswordAuthentication; kbdInteractiveAuthentication = c.services.openssh.settings.KbdInteractiveAuthentication; pubkeyAuthentication = c.services.openssh.settings.PubkeyAuthentication or true; authenticationMethods = c.services.openssh.settings.AuthenticationMethods or "any"; extraSshConfig = c.services.openssh.extraConfig; sshSettingNames = builtins.attrNames c.services.openssh.settings; keys = c.users.users.root.openssh.authorizedKeys.keys ++ (map builtins.readFile c.users.users.root.openssh.authorizedKeys.keyFiles); hasDisko = c.system.build ? diskoScript; disks = map (d: d.device) (builtins.attrValues (c.disko.devices.disk or {})); }']));
  if (summary.system !== "x86_64-linux") throw new Error("Only x86_64-linux servers are supported");
  if (!summary.ssh || !summary.ports.includes(22) || !["yes", "prohibit-password", "without-password"].includes(summary.rootLogin)) {
    throw new Error("NixOS must enable root SSH with a public key on port 22");
  }
  validateSshPolicy(summary);
  if (!summary.hasDisko) throw new Error("The configuration must include disko");
  if ((config.tcpPorts ?? []).some(port => !Number.isInteger(port) || port < 1 || port > 65535)) throw new Error("tcpPorts must contain integers between 1 and 65535");
  if (summary.firewall !== false && (config.tcpPorts ?? []).some(port => !(summary.tcpPorts ?? []).includes(port) && !(summary.tcpRanges ?? []).some(range => port >= range.from && port <= range.to))) throw new Error("OS_FIREWALL_PORTS: Pulumi tcpPorts are not open in NixOS. Run nixos-vps validate --stack <stack> for the bundled template; for a custom flake update networking.firewall.allowedTCPPorts before retrying.");
  if (JSON.stringify(summary.disks) !== JSON.stringify([config.expectedDisk])) throw new Error("NixOS disko must target only expectedDisk; refusing a different or multiple disk layout");
  if (!summary.keys.flatMap(key => key.split("\n")).some(key => keyIdentity(key) === keyIdentity(publicKey))) throw new Error("SSH public key is absent from the NixOS root authorized keys");
  const systemPath = execute("nix", ["build", "--no-link", "--print-out-paths", "--no-update-lock-file", `${flake}.config.system.build.toplevel`], { stdio: ["ignore", "pipe", "pipe"] });
  const diskoPath = execute("nix", ["build", "--no-link", "--print-out-paths", "--no-update-lock-file", `${flake}.config.system.build.diskoScript`], { stdio: ["ignore", "pipe", "pipe"] });
  const installerPath = execute("nix", ["build", "--no-link", "--print-out-paths", "--no-update-lock-file", config.installer], { stdio: ["ignore", "pipe", "pipe"] });
  verifyInstaller(installerPath, io);
  return { publicKey, hostPublicKey, hostKeyDigest: digest(io.readFileSync(config.hostKeyPrivatePath)), installerPath, systemPath, diskoPath };
}
async function waitForSsh(execute, args, remoteCommand, timeout, sleep, now = Date.now) {
  const deadline = now() + timeout * 1000;
  do {
    try { return execute("ssh", [...args, remoteCommand], { timeout: 15000 }); }
    catch (error) {
      if (error.code === "SSH_HOST_IDENTITY") throw error;
      if (now() >= deadline) throw new Error(`SSH readiness timed out after ${timeout}s. ${error.code?.startsWith("SSH_") ? error.message : "Verify the deployment key, root SSH, cloud firewall, and bootstrap/installed system through a trusted channel."}`);
      await sleep(3000);
    }
  } while (true);
}
async function install(config, env, execute, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), event = () => {}) {
  const target = env.NIXOS_TARGET;
  if (!target || net.isIP(target) !== 4) throw new Error("NIXOS_TARGET must be an IPv4 address");
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "nixos-bootstrap-"));
  const knownHosts = path.join(temporary, "known_hosts");
  try {
    const checked = preflight(config, execute);
    fs.writeFileSync(knownHosts, `${target} ${checked.hostPublicKey}\n`, { mode: 0o600 });
    const sshArgs = strictSshArgs(config, knownHosts, `root@${target}`);
    const trustedExecute = (binary, args, options = {}) => execute(binary, args, {
      ...options, env: { ...childEnvironment(env), NIXOS_KNOWN_HOSTS: knownHosts },
    });
    event("bootstrap-ssh");
    const currentOs = await waitForSsh(trustedExecute, sshArgs,
      '. /etc/os-release; printf "%s" "$ID"', config.timeout, sleep);
    if (currentOs === "nixos") throw new Error("Refusing to reinstall an existing NixOS system; use nixos-rebuild or recover Pulumi state");
    if (!["ubuntu", "debian"].includes(currentOs)) throw new Error("Bootstrap image must be Ubuntu or Debian");
    const disk = validateDisk(diskInventory(trustedExecute("ssh", [...sshArgs, "lsblk --tree --json --bytes --output PATH,TYPE,SERIAL,SIZE,MOUNTPOINTS"])), config);
    event("install");
    const installArgs = ["--build-on", "local", "--store-paths", checked.diskoPath, checked.systemPath, "--target-host", `root@${target}`,
      "-i", config.privateKeyPath, "--copy-host-keys"];
    trustedExecute(path.join(checked.installerPath, "bin/nixos-anywhere"), [...installArgs, "--phases", "kexec"]);
    await waitForSsh(trustedExecute, sshArgs, '. /etc/os-release; test "$ID" = nixos && test "$VARIANT_ID" = installer', config.timeout, sleep);
    validateDisk(diskInventory(trustedExecute("ssh", [...sshArgs, "lsblk --tree --json --bytes --output PATH,TYPE,SERIAL,SIZE,MOUNTPOINTS"])), config, disk, false);
    trustedExecute(path.join(checked.installerPath, "bin/nixos-anywhere"), [...installArgs, "--phases", "disko,install,reboot"]);
    event("post-install-ssh");
    const installed = await waitForSsh(trustedExecute, sshArgs,
      '. /etc/os-release; test "$ID" = nixos && systemctl is-active --quiet sshd && printf nixos', config.timeout, sleep);
    if (installed !== "nixos") throw new Error("Post-install NixOS verification failed");
    event("ready");
    return { installed: true };
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}
async function main(phase, env = process.env) {
  if (env.NIXOS_INPUT_ERROR) throw new Error(env.NIXOS_INPUT_ERROR);
  if (phase === "update") {
    console.log("Initial installation retained. Apply NixOS changes with nixos-rebuild.");
    return;
  }
  const config = settings(env);
  const execute = (binary, args, options) => run(binary, args, { env: childEnvironment(env), ...options });
  if (phase === "preflight") console.log(JSON.stringify(preflight(config, execute)));
  else if (phase === "install") console.log(JSON.stringify(await install(config, env, execute, undefined,
    stage => console.error(`NixOS bootstrap stage: ${stage}`))));
  else throw new Error("Expected preflight, install, or update");
}
module.exports = { validateSshPolicy, childEnvironment, settings, keyIdentity, checkTools, preflight, waitForSsh, install, main, run, digest, verifyInstaller, strictSshArgs, validateDisk, failure, diskInventory };
if (require.main === module) main(process.argv[2]).catch(error => { console.error(error.message); process.exitCode = 1; });
