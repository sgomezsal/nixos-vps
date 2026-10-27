package main

import (
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi/config"
	"github.com/sgomezsal/nixos-vps/sdk/go/nixosvps/hetzner"
)

func main() {
	pulumi.Run(func(ctx *pulumi.Context) error {
		c := config.New(ctx, "")
		flake := c.Require("flakeDirectory")
		configuration := c.Get("configuration")
		if configuration == "" {
			configuration = "web"
		}
		serverType := c.Get("serverType")
		if serverType == "" {
			serverType = "cx23"
		}
		location := c.Get("location")
		if location == "" {
			location = "nbg1"
		}
		ports := []int{80, 443}
		if err := c.GetObject("tcpPorts", &ports); err != nil {
			return err
		}
		var sources []string
		if err := c.GetObject("sshSourceIps", &sources); err != nil {
			return err
		}
		var sshSources pulumi.StringArrayInput
		if sources != nil {
			values := make(pulumi.StringArray, len(sources))
			for index, source := range sources {
				values[index] = pulumi.String(source)
			}
			sshSources = values
		}
		disk := c.Get("expectedDisk")
		if disk == "" {
			disk = "/dev/sda"
		}
		server, err := hetzner.NewNixosServer(ctx, "web", &hetzner.NixosServerArgs{
			FlakeDirectory:        flake,
			Configuration:         configuration,
			Installer:             flake + "#nixos-anywhere",
			SshPublicKeyPath:      c.Require("sshPublicKeyPath"),
			SshPrivateKeyPath:     c.Require("sshPrivateKeyPath"),
			SshHostKeyPrivatePath: c.Require("sshHostKeyPrivatePath"),
			ServerType:            pulumi.StringPtr(serverType),
			Location:              pulumi.StringPtr(location),
			TcpPorts:              ports,
			SshSourceIps:          sshSources,
			ExpectedDisk:          &disk,
		})
		if err != nil {
			return err
		}
		ctx.Export("ipv4", server.Ipv4)
		ctx.Export("serverId", server.ServerId)
		return nil
	})
}
