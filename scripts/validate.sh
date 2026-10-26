#!/usr/bin/env bash
# Local only: real engine uses file state and loopback substitute providers.
set -euo pipefail
repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_dir"
nix flake check
nix shell --inputs-from . nixpkgs#nodejs_22 nixpkgs#sops nixpkgs#age nixpkgs#openssh nixpkgs#which nixpkgs#pulumi-bin nixpkgs#actionlint --command bash -c \
  'npm ci --ignore-scripts && npm run check && npm test && npm run test:secrets && npm run test:preflight && node scripts/test-ssh-identity.cjs && node scripts/test-ssh-policy.cjs && node scripts/test-engine.cjs && node scripts/test-publication.cjs && node scripts/test-template-parity.cjs && npm audit --audit-level=high && node scripts/scan-validation.cjs'
nix run .#nixos-anywhere -- --flake .#hetzner-cloud --vm-test
