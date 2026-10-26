# All SSH phases authenticate the same operator-provisioned Ed25519 host key.
{ nixos-anywhere, fetchurl, python3 }:
let
  kexecImage = fetchurl {
    url = "https://github.com/nix-community/nixos-images/releases/download/nixos-26.05/nixos-kexec-installer-noninteractive-x86_64-linux.tar.gz";
    hash = "sha256-aszcR69v6ePC8bGANc3uh9WMh8BfEw4v5jE0tIhCFrw=";
  };
in nixos-anywhere.overrideAttrs (old: {
  postPatch = (old.postPatch or "") + ''
    substituteInPlace src/nixos-anywhere.sh \
      --replace-fail 'UserKnownHostsFile=/dev/null' 'UserKnownHostsFile=''${NIXOS_KNOWN_HOSTS:-/dev/null}' \
      --replace-fail 'StrictHostKeyChecking=no' 'StrictHostKeyChecking=yes' \
      --replace-fail 'declare -a sshArgs=(' 'declare -a sshArgs=("-F" "/dev/null" "-o" "GlobalKnownHostsFile=/dev/null" "-o" "HostKeyAlgorithms=ssh-ed25519" "-o" "UpdateHostKeys=no" "-o" "VerifyHostKeyDNS=no" "-o" "ForwardAgent=no" "-o" "IdentityAgent=none" "-o" "BatchMode=yes" ' \
      --replace-fail 'https://github.com/nix-community/nixos-images/releases/download/nixos-25.05/nixos-kexec-installer-noninteractive-''${isArch}-linux.tar.gz' '${kexecImage}'
  '';
  postFixup = (old.postFixup or "") + ''
    ${python3}/bin/python3 - "$out" '${kexecImage}' <<'PY'
import hashlib, json, pathlib, sys
root, image = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
driver = root / "bin/.nixos-anywhere-wrapped"
manifest = {"securityVersion": 1, "driver": "bin/.nixos-anywhere-wrapped",
            "driverSha256": hashlib.sha256(driver.read_bytes()).hexdigest(),
            "kexecPath": str(image), "kexecSha256": hashlib.sha256(image.read_bytes()).hexdigest()}
(root / "share").mkdir(exist_ok=True)
(root / "share/nixos-installer-security.json").write_text(json.dumps(manifest))
PY
  '';
})
