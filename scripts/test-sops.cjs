// Verify the documented SOPS flow using temporary identities and a fake token.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "nixos-sops-test-"));
function run(binary, args, extra = {}) {
  return spawnSync(binary, args, { encoding: "utf8", cwd: temporary,
    env: { PATH: process.env.PATH, HOME: temporary, SOPS_AGE_KEY_FILE: path.join(temporary, "operator") }, ...extra });
}
function succeed(binary, args) {
  const result = run(binary, args);
  assert.equal(result.status, 0, result.error?.message || result.stderr);
  return result.stdout.trim();
}
try {
  for (const identity of ["operator", "server"]) succeed("age-keygen", ["-o", path.join(temporary, identity)]);
  const operator = succeed("age-keygen", ["-y", path.join(temporary, "operator")]);
  const server = succeed("age-keygen", ["-y", path.join(temporary, "server")]);
  const template = fs.readFileSync(path.join(__dirname, "../.sops.yaml.example"), "utf8")
    .replace(/age1x+/g, server).replace(/age1y+/g, operator);
  fs.writeFileSync(path.join(temporary, ".sops.yaml"), template);
  fs.mkdirSync(path.join(temporary, "secrets"));
  fs.writeFileSync(path.join(temporary, "secrets/provisioning.env"), "HCLOUD_TOKEN=local-test-not-a-real-token\n");
  const ciphertext = succeed("sops", ["encrypt", "--input-type", "dotenv", "--output-type", "dotenv",
    "--filename-override", "secrets/provisioning.enc.env", "secrets/provisioning.env"]);
  assert.ok(!ciphertext.includes("local-test-not-a-real-token"));
  fs.writeFileSync(path.join(temporary, "secrets/provisioning.enc.env"), ciphertext + "\n");
  const verify = path.join(temporary, "verify.cjs");
  fs.writeFileSync(verify, 'if(process.env.HCLOUD_TOKEN!=="local-test-not-a-real-token")process.exit(1); require("fs").writeFileSync("executed", "yes"); console.log("injected");');
  // Both executable and fixture paths are generated locally; no user shell text.
  const quote = value => "'" + value.replace(/'/g, "'\\''") + "'";
  const result = succeed("sops", ["exec-env", "secrets/provisioning.enc.env", `${quote(process.execPath)} ${quote(verify)}`]);
  assert.equal(result, "injected");
  fs.unlinkSync(path.join(temporary, "executed"));
  const wrongIdentity = run("sops", ["exec-env", "secrets/provisioning.enc.env", `${quote(process.execPath)} ${quote(verify)}`], {
    env: { PATH: process.env.PATH, HOME: temporary, SOPS_AGE_KEY_FILE: path.join(temporary, "server") },
  });
  assert.notEqual(wrongIdentity.status, 0, "Server must not decrypt the provisioning token");
  assert.equal(fs.existsSync(path.join(temporary, "executed")), false);
  const missingIdentity = run("sops", ["exec-env", "secrets/provisioning.enc.env", `${quote(process.execPath)} ${quote(verify)}`], {
    env: { PATH: process.env.PATH, HOME: temporary, SOPS_AGE_KEY_FILE: path.join(temporary, "missing-identity") },
  });
  assert.notEqual(missingIdentity.status, 0);
  assert.equal(fs.existsSync(path.join(temporary, "executed")), false);
  console.log("SOPS injects a fake token; the VPS identity cannot decrypt operator credentials.");
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
