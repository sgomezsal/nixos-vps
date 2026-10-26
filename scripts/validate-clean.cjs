// Build a tracked-source snapshot with empty HOME and no node_modules or tokens.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "nixos-vps-clean-"));
const source = path.join(temporary, "source");
const home = path.join(temporary, "home");
fs.mkdirSync(source); fs.mkdirSync(home);
function run(binary, args, options = {}) {
  const result = spawnSync(binary, args, { encoding: "utf8", timeout: 30 * 60 * 1000, maxBuffer: 64 * 1024 * 1024, ...options });
  assert.equal(result.status, 0, result.stderr || result.stdout || result.error?.message);
  return result.stdout;
}
try {
  const files = run("git", ["ls-files", "-z"], { cwd: root }).split("\0").filter(Boolean);
  for (const file of files) {
    const original = path.join(root, file);
    if (!fs.existsSync(original)) continue; // Pending tracked deletions.
    assert.ok(!file.split(path.sep).includes("node_modules"));
    const destination = path.join(source, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(original, destination);
    fs.chmodSync(destination, fs.statSync(original).mode & 0o777);
  }
  const env = Object.fromEntries(["PATH", "USER", "LOGNAME", "NIX_REMOTE", "NIX_SSL_CERT_FILE", "SSL_CERT_FILE"]
    .filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
  Object.assign(env, { HOME: home, NIX_CONFIG: "experimental-features = nix-command flakes\n", GIT_CONFIG_NOSYSTEM: "1" });
  run("git", ["init", "--quiet"], { cwd: source, env });
  run("git", ["add", "."], { cwd: source, env });
  run("git", ["-c", "user.name=Local validation", "-c", "user.email=validation@example.invalid", "commit", "--quiet", "-m", "Disposable validation snapshot"], { cwd: source, env });
  console.log("Clean snapshot: tracked source only, empty HOME/npm cache, no node_modules or cloud credentials; shared system/Nix store caches retained.");
  // Output is streamed to the caller's log; a nonzero test status fails this script.
  const result = spawnSync("bash", ["scripts/validate.sh"], { cwd: source, env, stdio: "inherit", timeout: 30 * 60 * 1000 });
  assert.equal(result.status, 0, result.error?.message || "Clean validation failed");
  console.log("CLEAN VALIDATION PASSED. Pulumi engine used only loopback substitute providers and file state; no cloud access.");
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
