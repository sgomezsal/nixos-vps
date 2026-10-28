{
  description = "nixos-vps: reproducible NixOS VPS provisioning with Pulumi and nixos-anywhere";

  inputs = {
    # Upgrade this pinned dependency deliberately.
    nixpkgs.url = "github:NixOS/nixpkgs/00c21e4c93d963c50d4c0c89bfa84ed6e0694df2";
    flake-utils.url = "github:numtide/flake-utils";
    disko = {
      # Match the disko release packaged by our pinned nixpkgs/test driver.
      url = "github:nix-community/disko/v1.13.0";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    { self, nixpkgs, flake-utils, disko }:
    {
      nixosModules.hetzner-cloud = {
        imports = [
          disko.nixosModules.disko
          ./nix/hetzner-cloud.nix
          ./hosts/hetzner-cloud/disk-config.nix
        ];
      };
      nixosConfigurations.example = nixpkgs.lib.nixosSystem {
        system = "x86_64-linux";
        modules = [ self.nixosModules.hetzner-cloud ./examples/hetzner/configuration.nix ];
      };
      # Fresh installations only. Applying this disk layout destroys the target disk.
      nixosConfigurations.hetzner-cloud = nixpkgs.lib.nixosSystem {
        system = "x86_64-linux";
        modules = [
          self.nixosModules.hetzner-cloud
          ./hosts/hetzner-cloud/configuration.nix
        ];
      };
    }
    // flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs { inherit system; };
      in
      {
        packages.nixos-anywhere = pkgs.callPackage ./packages/nixos-vps/templates/nixos/secure-installer.nix { };
        checks = nixpkgs.lib.optionalAttrs (system == "x86_64-linux") {
          install-template = (nixpkgs.lib.nixosSystem {
            system = "x86_64-linux";
            modules = [
              disko.nixosModules.disko
              ./packages/nixos-vps/templates/nixos/configuration.nix
              ./packages/nixos-vps/templates/nixos/disk-config.nix
              ./nix/hetzner-cloud.nix
              ({ lib, pkgs, ... }: {
                users.users.root.openssh.authorizedKeys.keyFiles = lib.mkForce [ ./examples/hetzner/admin.pub ];
                disko.tests.extraChecks = ''
                  machine.wait_for_unit("caddy.service")
                  machine.succeed("${pkgs.curl}/bin/curl --fail http://127.0.0.1 | grep -q 'NixOS provisioned by Pulumi'")
                '';
              })
            ];
          }).config.system.build.installTest;
          install-example = self.nixosConfigurations.example.config.system.build.installTest;
          install-efi = self.nixosConfigurations.hetzner-cloud.config.system.build.installTest;
          install-bios = (self.nixosConfigurations.hetzner-cloud.extendModules {
            modules = [ { disko.tests.efi = false; } ];
          }).config.system.build.installTest;
        };
        devShells.provider = pkgs.mkShell {
          inputsFrom = [ self.devShells.${system}.default ];
          # PyPI's gRPC wheel needs the C++ runtime when used on NixOS.
          LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath [ pkgs.stdenv.cc.cc.lib ];
          packages = [
            (pkgs.python3.withPackages (ps: [ ps.build ps.setuptools ps.wheel ]))
            pkgs.go pkgs.gnutar pkgs.gzip
          ];
        };
        devShells.default = pkgs.mkShell {
          # Use SDK-selected plugins rather than older providers bundled on PATH.
          PULUMI_IGNORE_AMBIENT_PLUGINS = "true";
          buildInputs = with pkgs; [
            pulumi-bin
            nodejs_22
            openssh
            git
            (pkgs.callPackage ./packages/nixos-vps/templates/nixos/secure-installer.nix { })
            sops
            age
            ssh-to-age
          ];

          shellHook = ''
            echo "NixOS + Pulumi + sops dev environment ready"
          '';
        };
      }
    );
}
