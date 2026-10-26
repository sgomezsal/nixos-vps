"use strict";
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const YAML = require("yaml");

function stackName(value) {
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) throw new Error("--stack must be a simple local stack name, e.g. dev");
  return value;
}
function readYaml(filename) {
  if (!fs.existsSync(filename)) throw new Error(`Missing ${path.basename(filename)}. Run nixos-vps init in a new project, or select the correct --stack.`);
  const doc = YAML.parseDocument(fs.readFileSync(filename, "utf8"), { uniqueKeys: true });
  if (doc.errors.length) throw new Error(`Invalid YAML in ${path.basename(filename)}; check indentation and duplicate keys.`);
  return doc.toJS({ maxAliasCount: 10 });
}
function validateInputs(c) {
  if (typeof c.serverType !== "string" || !/^(cx|cpx|ccx)\d+$/.test(c.serverType)) throw new Error("serverType must be an x86_64 CX, CPX or CCX plan; ARM/CAX is unsupported");
  if (typeof c.location !== "string" || !/^[a-z]{3}\d+$/.test(c.location)) throw new Error("location must be a Hetzner location code, e.g. nbg1");
  if (!/^(ubuntu|debian)-\d+(?:\.\d+)?$/.test(c.bootstrapImage)) throw new Error("bootstrapImage must be an Ubuntu or Debian image name");
  if (!Array.isArray(c.tcpPorts) || c.tcpPorts.some(p => !Number.isInteger(p) || p < 1 || p > 65535)) throw new Error("tcpPorts must be an array of integers between 1 and 65535");
  if (!Array.isArray(c.sshSourceIps) || !c.sshSourceIps.length || c.sshSourceIps.some(value => {
    if (typeof value !== "string") return true;
    const [ip, prefix, extra] = value.split("/"); const family = net.isIP(ip);
    return !family || extra !== undefined || (prefix !== undefined && (!/^\d+$/.test(prefix) || +prefix > (family === 4 ? 32 : 128)));
  })) throw new Error("sshSourceIps must include valid IP addresses or CIDRs for the deployment runner");
  if (c.existingSshKeyIds !== undefined && (!Array.isArray(c.existingSshKeyIds) || !c.existingSshKeyIds.length || c.existingSshKeyIds.some(id => typeof id !== "string" || !/^\d+$/.test(id)))) throw new Error("existingSshKeyIds must contain nonempty numeric key IDs as strings");
  if (!Number.isInteger(c.sshTimeoutSeconds) || c.sshTimeoutSeconds < 1 || c.sshTimeoutSeconds > 3600) throw new Error("sshTimeoutSeconds must be between 1 and 3600");
  return c;
}
function loadProject(directory, stack) {
  stackName(stack);
  const project = readYaml(path.join(directory, "Pulumi.yaml"));
  if (typeof project?.name !== "string" || !project.name) throw new Error("Pulumi.yaml must declare a project name");
  const file = path.join(directory, `Pulumi.${stack}.yaml`);
  const config = readYaml(file)?.config ?? {};
  const get = (name, fallback) => {
    const value = config[`${project.name}:${name}`] ?? fallback;
    if (value && typeof value === "object" && "secure" in value) throw new Error(`${name} is encrypted; local validation cannot decrypt Pulumi secrets. Keep these non-secret settings as plaintext config; supply HCLOUD_TOKEN separately.`);
    return value;
  };
  const array = (name, fallback) => {
    const value = get(name, fallback);
    if (typeof value !== "string") return value;
    try { return JSON.parse(value); } catch { throw new Error(`${name} must be a YAML array or a JSON array string`); }
  };
  const c = validateInputs({
    serverType: get("serverType", "cpx22"), location: get("location", "nbg1"), bootstrapImage: get("bootstrapImage", "ubuntu-24.04"),
    tcpPorts: array("tcpPorts", [80, 443]), sshSourceIps: array("sshSourceIps", ["0.0.0.0/0", "::/0"]), existingSshKeyIds: array("existingSshKeyIds", undefined),
    sshTimeoutSeconds: Number(get("sshTimeoutSeconds", 600)), expectedDisk: get("expectedDisk", "/dev/sda"), expectedDiskSerial: get("expectedDiskSerial", ""),
  });
  for (const key of ["sshPublicKeyPath", "sshPrivateKeyPath", "sshHostKeyPrivatePath"]) {
    const value = get(key);
    if (typeof value !== "string" || !path.isAbsolute(value)) throw new Error(`${key} must be an absolute path in Pulumi.${stack}.yaml; generate keys with nixos-vps init`);
    c[key] = value;
  }
  return { ...c, directory, stack, projectName: project.name };
}
module.exports = { stackName, readYaml, validateInputs, loadProject };
