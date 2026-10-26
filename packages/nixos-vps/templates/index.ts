import * as path from "node:path";
import * as pulumi from "@pulumi/pulumi";
import { NixosServer } from "nixos-vps";
const config = new pulumi.Config();
const flakeDirectory = path.resolve("nixos");
const server = new NixosServer("web", {
  flakeDirectory,
  configuration: "web",
  installer: `${flakeDirectory}#nixos-anywhere`,
  sshPublicKeyPath: config.require("sshPublicKeyPath"),
  sshPrivateKeyPath: config.require("sshPrivateKeyPath"),
  sshHostKeyPrivatePath: config.require("sshHostKeyPrivatePath"),
  expectedDisk: config.get("expectedDisk") ?? "/dev/sda",
  expectedDiskSerial: config.get("expectedDiskSerial"),
  serverType: config.get("serverType") ?? "cpx22",
  location: config.get("location") ?? "nbg1",
  bootstrapImage: config.get("bootstrapImage") ?? "ubuntu-24.04",
  sshSourceIps: config.getObject<string[]>("sshSourceIps"),
  sshTimeoutSeconds: config.getNumber("sshTimeoutSeconds"),
  existingSshKeyIds: config.getObject<string[]>("existingSshKeyIds"),
  tcpPorts: config.getObject<number[]>("tcpPorts") ?? [80, 443],
}, { protect: true });
export const ipv4 = server.ipv4;
