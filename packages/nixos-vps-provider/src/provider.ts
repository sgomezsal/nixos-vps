import * as fs from "node:fs";
import * as path from "node:path";
import * as pulumi from "@pulumi/pulumi";
import type { Provider, ConstructResult } from "@pulumi/pulumi/provider";
import { NixosServer, NixosServerArgs } from "nixos-vps";

export const resourceType = "nixos-vps:hetzner:NixosServer";
const schemaDocument = JSON.parse(fs.readFileSync(path.join(__dirname, "../schema.json"), "utf8"));
const metadata = JSON.parse(fs.readFileSync(path.join(__dirname, "../package.json"), "utf8"));

/** Validate the RPC boundary without reading operator files or logging values. */
export function validateInputs(inputs: pulumi.Inputs): NixosServerArgs {
    const properties = schemaDocument.resources[resourceType].inputProperties;
    if (!inputs || typeof inputs !== "object" || Array.isArray(inputs)) {
        throw new Error("NixosServer inputs must be an object");
    }
    for (const key of Object.keys(inputs)) {
        if (!Object.prototype.hasOwnProperty.call(properties, key)) {
            throw new Error("Unsupported NixosServer input; consult the component schema");
        }
    }
    const required = schemaDocument.resources[resourceType].requiredInputs as string[];
    for (const key of required) {
        if (typeof inputs[key] !== "string" || !inputs[key].trim()) {
            throw new Error(`${key} must be a nonempty plain string, not an Output or secret`);
        }
    }
    for (const key of ["flakeDirectory", "sshPublicKeyPath", "sshPrivateKeyPath", "sshHostKeyPrivatePath"]) {
        if (!path.isAbsolute(inputs[key])) {
            throw new Error(`${key} must be an absolute path on the Pulumi execution machine`);
        }
    }
    const installer = inputs.installer as string;
    if (!path.isAbsolute(installer) && !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(installer)) {
        throw new Error("installer must be an absolute flake package path or an explicit flake URL");
    }
    for (const key of ["expectedDisk", "expectedDiskSerial"]) {
        if (inputs[key] !== undefined && (typeof inputs[key] !== "string" || !inputs[key].trim())) {
            throw new Error(`${key} must be a nonempty plain string`);
        }
    }
    if (inputs.tcpPorts !== undefined && (!Array.isArray(inputs.tcpPorts) ||
        inputs.tcpPorts.some((port: unknown) => !Number.isInteger(port) || Number(port) < 1 || Number(port) > 65535))) {
        throw new Error("tcpPorts must be a plain array of integer ports between 1 and 65535");
    }
    if (inputs.sshTimeoutSeconds !== undefined && (!Number.isInteger(inputs.sshTimeoutSeconds) ||
        inputs.sshTimeoutSeconds < 1 || inputs.sshTimeoutSeconds > 3600)) {
        throw new Error("sshTimeoutSeconds must be a plain integer between 1 and 3600");
    }
    // Leave Input/Output values intact. The shared implementation validates
    // deferred infrastructure inputs and gates all child provisioning on them.
    return { ...inputs } as unknown as NixosServerArgs;
}

/** A remote component adapter, not a second installer or cloud resource provider. */
export class NixosServerProvider implements Provider {
    readonly version: string = metadata.version;
    readonly schema: string = JSON.stringify({ ...schemaDocument, version: metadata.version });

    async construct(name: string, type: string, inputs: pulumi.Inputs,
        options: pulumi.ComponentResourceOptions): Promise<ConstructResult> {
        if (type !== resourceType) {
            throw new Error("Unsupported component type; expected nixos-vps:hetzner:NixosServer");
        }
        const args = validateInputs(inputs);
        const component = new NixosServer(name, args, options);
        return { urn: component.urn, state: { ipv4: component.ipv4, serverId: component.serverId } };
    }
}
