import pulumi
from pulumi_nixos_vps.hetzner import NixosServer

config = pulumi.Config()
flake_directory = config.require("flakeDirectory")
ports = config.get_object("tcpPorts")
server = NixosServer(
    "web",
    flake_directory=flake_directory,
    configuration=config.get("configuration") or "web",
    installer=f"{flake_directory}#nixos-anywhere",
    ssh_public_key_path=config.require("sshPublicKeyPath"),
    ssh_private_key_path=config.require("sshPrivateKeyPath"),
    ssh_host_key_private_path=config.require("sshHostKeyPrivatePath"),
    server_type=config.get("serverType") or "cx23",
    location=config.get("location") or "nbg1",
    tcp_ports=ports if ports is not None else [80, 443],
    ssh_source_ips=config.get_object("sshSourceIps"),
    expected_disk=config.get("expectedDisk") or "/dev/sda",
)
pulumi.export("ipv4", server.ipv4)
pulumi.export("serverId", server.server_id)
