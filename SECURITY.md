# Security

Installation formats the selected server disk. Review the NixOS and disko
configuration before deployment, and keep backups independently of Pulumi state.

## Reporting a vulnerability

Email [contact@sgomezsal.com](mailto:contact@sgomezsal.com) to report a suspected
vulnerability privately. Include affected versions, a description of the impact
and minimal reproduction steps. Do not send credentials, private keys, Pulumi
state exports or unredacted logs, and do not open a public issue with exploit
details before coordination.

## Credentials and keys

Supply Hetzner credentials through `HCLOUD_TOKEN` or a configured Pulumi provider.
SOPS `exec-env` is an optional way to inject the operator token. Keep credentials
out of source files, Nix expressions and command-line arguments.

Keep both SSH private keys outside the project, with mode `0600` in a protected
directory. The deployment client private key remains local. The dedicated server
host private key is sent in Hetzner cloud-init user-data and stored as a Pulumi
secret. Protect provider metadata access, the Pulumi backend and its encryption
credentials.

Generated ignore rules cover common environment files, private-key formats and
local state. Review files before committing: ignore rules cannot protect files
that are already tracked or recognize every possible credential filename.

## SSH authentication

The templates and preflight require:

```nix
services.openssh.settings = {
  PasswordAuthentication = false;
  KbdInteractiveAuthentication = false;
  PubkeyAuthentication = true;
  AuthenticationMethods = "publickey";
  PermitRootLogin = "prohibit-password";
};
```

`without-password` is also accepted for `PermitRootLogin`. Configure the canonical
settings above. Raw authentication directives, `Match` blocks, `Include` files and
the deprecated `ChallengeResponseAuthentication` override are unsupported during
initial provisioning. They can alter the policy beyond what preflight verifies.
The errors `SSH_AUTH_POLICY` and `SSH_AUTH_OVERRIDES` describe the required changes.

Installation pins one predetermined Ed25519 host identity through bootstrap,
kexec and the final system. Unknown or changed host keys stop the operation.
Never disable verification to recover from a connection failure.

## Installation safeguards

The runner checks a checksum-pinned kexec payload and immutable installer outputs.
Before formatting, it requires one root disk, the expected device path, a valid
size and a stable nonempty serial. It compares that identity again after kexec.
Disks without usable serials and servers with attached data disks are unsupported.

The included baseline keeps NixOS logrotate configuration validation enabled.
Initial installation and routine system updates are separate operations.

## Logs and reports

Installation emits stage names and classified errors. Raw child diagnostics are
suppressed because builds can expose secrets. Run suggested diagnostic commands
in a controlled terminal and redact logs before sharing them.

If credentials are exposed, revoke or rotate them. Do not include secrets, private
keys or state exports in public issues.

## Verification limits

Local tests cover package distribution, NixOS builds and VMs, SSH checks and Pulumi
lifecycle behavior with substitute providers. One live CX23 installation in
Helsinki verified cloud-init host identity, SSH continuity through kexec and the
final boot, disk identity, public HTTP and an unchanged second deployment, using
the disk-inventory fix included in 0.1.2. Subsequent checks verified normal reboots
and a routine configuration update while retaining pinned SSH verification.
Other provider configurations, package/kernel upgrades and recovery
after kexec or formatting remain unverified. This is not a comprehensive security
audit. See
[validation coverage](docs/validation.md).

Those live results cover the original TypeScript component. The experimental
multi-language provider has passed local engine and public distribution checks,
but no live stack migration or fresh installation through that provider has
been verified. Keep resource protection enabled during migration; an uncertain
preview is not evidence that a replacement is safe.
