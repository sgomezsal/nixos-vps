import * as pulumi from "@pulumi/pulumi";
import {hetzner} from "@sgomezsal/nixos-vps";

const config = new pulumi.Config();
const flakeDirectory = config.require("flakeDirectory");
const server = new hetzner.NixosServer("web", {
    flakeDirectory,
    configuration: config.get("configuration") ?? "web",
    installer: `${flakeDirectory}#nixos-anywhere`,
    sshPublicKeyPath: config.require("sshPublicKeyPath"),
    sshPrivateKeyPath: config.require("sshPrivateKeyPath"),
    sshHostKeyPrivatePath: config.require("sshHostKeyPrivatePath"),
    serverType: config.get("serverType") ?? "cx23",
    location: config.get("location") ?? "nbg1",
    tcpPorts: config.getObject<number[]>("tcpPorts") ?? [80, 443],
    sshSourceIps: config.getObject<string[]>("sshSourceIps"),
    expectedDisk: config.get("expectedDisk") ?? "/dev/sda",
});

export const ipv4 = server.ipv4;
export const serverId = server.serverId;
