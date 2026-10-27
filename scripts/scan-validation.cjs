// Signature scan: report filenames only, never print a matched credential.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const listed = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: root, encoding: "utf8" });
if (listed.status !== 0) throw new Error("Unable to enumerate tracked source");
const files = listed.stdout.split("\0").filter(Boolean).map(file => path.join(root, file));
for (const directory of [path.join(root, "packages/nixos-vps/lib"), path.join(root, "packages/nixos-vps-provider/lib"), path.join(root, ".validation")]) {
  if (!fs.existsSync(directory)) continue;
  const visit = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const filename = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(filename); else if (entry.isFile()) files.push(filename);
    }
  }; visit(directory);
}
const patterns = [
  /-----BEGIN (?:OPENSSH|RSA|EC|DSA|PGP) PRIVATE KEY-----/,
  /\bAGE-SECRET-KEY-1[0-9A-Z]{20,}/,
  /\b(?:ghp_|github_pat_)[A-Za-z0-9_]{30,}/,
  /\bsk-proj-[A-Za-z0-9_-]{30,}/,
  /HCLOUD_TOKEN\s*[:=]\s*["']?[a-fA-F0-9]{64}\b/,
];
const findings = [];
let checked = 0;
for (const filename of new Set(files)) {
  if (!fs.existsSync(filename) || !fs.statSync(filename).isFile()) continue;
  if (/\.(tgz|png|pdf|woff2|ttf)$/.test(filename)) continue;
  const content = fs.readFileSync(filename, "utf8"); checked++;
  if (patterns.some(pattern => pattern.test(content))) findings.push(path.relative(root, filename));
}
console.log(`Credential signature scan: ${checked} source/build/log files; ${findings.length} findings. Known test placeholders and encrypted SOPS/Pulumi values are not credentials.`);
if (findings.length) { console.error("Review findings in:", findings.join(", ")); process.exitCode = 1; }
