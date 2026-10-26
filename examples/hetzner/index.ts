import * as pulumi from "@pulumi/pulumi";
import { NixosServer } from "nixos-vps";
import * as path from "node:path";
const config = new pulumi.Config();
const root = path.resolve(__dirname, "../..");
const server = new NixosServer("web", {
  flakeDirectory: root,
  configuration: "example",
  installer: `${root}#nixos-anywhere`,
  sshPublicKeyPath: config.require("sshPublicKeyPath"),
  sshPrivateKeyPath: config.require("sshPrivateKeyPath"),
  sshHostKeyPrivatePath: config.require("sshHostKeyPrivatePath"),
  expectedDisk: config.get("expectedDisk") ?? "/dev/sda",
  expectedDiskSerial: config.get("expectedDiskSerial"),
  serverType: config.get("serverType") ?? "cpx22",
  location: config.get("location") ?? "nbg1",
  tcpPorts: config.getObject<number[]>("tcpPorts") ?? [80, 443],
  existingSshKeyIds: config.getObject<string[]>("existingSshKeyIds"),
  sshSourceIps: config.getObject<string[]>("sshSourceIps"),
}, { protect: true });
export const ipv4 = server.ipv4;
export const serverId = server.serverId;
