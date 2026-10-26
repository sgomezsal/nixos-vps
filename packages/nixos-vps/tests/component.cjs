const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const pulumi = require("@pulumi/pulumi");
const { NixosServer } = require("../lib");
const os=require("node:os"), path=require("node:path"), fs=require("node:fs"), crypto=require("node:crypto");
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"host-identity-component-"));
const hostPath=path.join(tmp,"host");fs.writeFileSync(hostPath,"synthetic-host-private",{mode:0o600});
const {after}=require("node:test");after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
const hostKeyDigest=crypto.createHash("sha256").update("synthetic-host-private").digest("hex");
const resources = [];
const options = new Map();
const key = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAITest fixture";
pulumi.runtime.setMocks({
  newResource(args) {
    resources.push(args);
    return { id: args.type.includes("firewall") ? "101" : `${args.name}-id`, state: {
      ...args.inputs, ipv4Address: "192.0.2.1",
      stdout: args.name.endsWith("-preflight") ? JSON.stringify({ publicKey: key,hostPublicKey:key,hostKeyDigest }) : "",
    } };
  },
  call() { throw new Error("Unexpected provider call"); },
}, "component-test", "offline", false);
const args = {
  flakeDirectory: "/tmp/config with spaces", configuration: "web",
  installer: "/tmp/tool's checkout#nixos-anywhere",
  sshPublicKeyPath: "/tmp/test.pub", sshPrivateKeyPath: "/tmp/test-key", sshHostKeyPrivatePath:hostPath,
};
const resolve = output => new Promise(done => output.apply(done));
test("component groups resources and gates its IP on one-time installation", async () => {
  const server = new NixosServer("web", { ...args, tcpPorts: [443, 80, 443], sshSourceIps: ["203.0.113.1/32"] }, {
    transformations: [resource => { options.set(resource.name, resource.opts); return undefined; }],
  });
  assert.equal(await resolve(server.ipv4), "192.0.2.1");
  const component = resources.find(resource => resource.name === "web");
  assert.equal(component.type, "nixos-vps:hetzner:NixosServer");
  assert.ok((await resolve(server.urn)).includes("::nixos-vps:hetzner:NixosServer::web"));
  assert.ok((await resolve(server.server.urn)).includes("::nixos-vps:hetzner:NixosServer$hcloud:index/server:Server::"));
  const vm = resources.find(resource => resource.name === "web-server");
  const firewall = resources.find(resource => resource.name === "web-firewall");
  const ssh = resources.find(resource => resource.name === "web-ssh");
  const install = resources.find(resource => resource.name === "web-install");
  assert.equal(vm.inputs.image, "ubuntu-24.04");
  assert.equal(await server.server.userData.isSecret, true);
  assert.equal(install.inputs.environment.NIXOS_HOST_KEY_PATH,hostPath);
  assert.ok(!JSON.stringify(install.inputs).includes("synthetic-host-private"));
  assert.equal(vm.inputs.name, undefined); // provider auto-naming prevents fixed-name collisions
  assert.deepEqual(vm.inputs.firewallIds, [101]);
  assert.deepEqual(vm.inputs.sshKeys, ["web-ssh-id"]);
  assert.equal(ssh.inputs.publicKey, key);
  assert.deepEqual(firewall.inputs.rules.map(rule => rule.port).sort(), ["22", "443", "80"]);
  assert.deepEqual(firewall.inputs.rules[0].sourceIps, ["203.0.113.1/32"]);
  assert.deepEqual(install.inputs.triggers, ["web-server-id"]);
  assert.ok(options.get("web-install").replaceOnChanges.includes("triggers"));
  assert.equal(options.get("web-install").parent, server);
  assert.deepEqual(options.get("web-server").dependsOn, [server.preflight]);
  assert.match(install.inputs.create, / install$/);
  assert.match(install.inputs.update, / update$/);
  assert.equal(install.inputs.delete, undefined);
  assert.equal(install.inputs.environment.NIXOS_TARGET, "192.0.2.1");
  assert.equal(install.inputs.environment.NIXOS_INSTALLER, args.installer);
  assert.equal(install.inputs.addPreviousOutputInEnv, false);
  assert.ok(!JSON.stringify(install.inputs).includes("HCLOUD_TOKEN"));
  // Exercise the actual generated update command: it must not invoke SSH or Nix.
  const update = spawnSync("/bin/sh", ["-c", install.inputs.update], { encoding: "utf8", env: { PATH: "/nonexistent" } });
  assert.equal(update.status, 0, update.stderr);
  assert.match(update.stdout, /nixos-rebuild/);
  const second = new NixosServer("other", { ...args, existingSshKeyIds: ["123456"] });
  await resolve(second.ipv4);
  assert.equal(second.sshKey, undefined);
  assert.deepEqual(resources.find(resource => resource.name === "other-server").inputs.sshKeys, ["123456"]);
  assert.equal(resources.filter(resource => resource.type.includes("sshKey")).length, 1);
});
test("rejects invalid configuration and firewall inputs before registration", () => {
  assert.throws(() => new NixosServer("bad", { ...args, configuration: "web; touch /tmp/no" }), /attribute name/);
  assert.throws(() => new NixosServer("bad", { ...args, tcpPorts: [65536] }), /tcpPorts/);
  assert.throws(() => new NixosServer("bad", { ...args, sshTimeoutSeconds: 0 }), /sshTimeoutSeconds/);
  assert.throws(() => new NixosServer("bad", { ...args, serverType: "cax11" }), /ARM is unsupported/);
  assert.throws(() => new NixosServer("bad", { ...args, existingSshKeyIds: [] }), /must not be empty/);
  assert.throws(() => new NixosServer("bad", { ...args, sshSourceIps: [] }), /blocks installation/);
});
