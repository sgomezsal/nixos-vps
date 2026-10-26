const { test } = require("node:test");
const assert = require("node:assert/strict");
const pulumi = require("@pulumi/pulumi");
const { unknownValue } = require("@pulumi/pulumi/runtime/rpc");
const { NixosServer } = require("../lib");
const registered = [];
pulumi.runtime.setMocks({
  newResource(args) {
    registered.push(args);
    return { id: `${args.name}-preview`, state: { ...args.inputs, stdout: unknownValue, ipv4Address: unknownValue } };
  }, call() { throw new Error("Unexpected provider invocation during preview"); },
}, "preview-test", "offline", true);
test("mock preview registers the graph without reading key files and leaves ready IP unknown", async () => {
  const server = new NixosServer("preview", {
    flakeDirectory: "/does-not-exist", configuration: "web", installer: "/missing#nixos-anywhere",
    sshPublicKeyPath: "/missing.pub", sshPrivateKeyPath: "/missing-key", sshHostKeyPrivatePath:"/missing-host",
  });
  await server.installation.urn.promise();
  assert.equal(await server.ipv4.isKnown, false);
  assert.ok(registered.some(resource => resource.name === "preview-install"));
  assert.ok(registered.some(resource => resource.name === "preview-server"));
});
