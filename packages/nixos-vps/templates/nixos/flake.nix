{
  description = "Standalone locked NixOS VPS configuration";
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/00c21e4c93d963c50d4c0c89bfa84ed6e0694df2";
    disko = {
      url = "github:nix-community/disko/v1.13.0";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };
  outputs = { nixpkgs, disko, ... }: {
    packages.x86_64-linux.nixos-anywhere = nixpkgs.legacyPackages.x86_64-linux.callPackage ./secure-installer.nix { };
    nixosConfigurations.web = nixpkgs.lib.nixosSystem {
      system = "x86_64-linux";
      modules = [ disko.nixosModules.disko ./configuration.nix ./disk-config.nix ];
    };
  };
}
