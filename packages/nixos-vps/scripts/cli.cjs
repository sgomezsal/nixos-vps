#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const YAML = require("yaml");
const runner = require("./runner.cjs");
const { stackName, validateInputs, loadProject } = require("./project.cjs");

function options(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--fix") { if(result[flag])throw new Error("Duplicate option --fix");result[flag]=true;continue; }
    if (!["--stack", "--key-directory", "--location", "--server-type", "--ports"].includes(flag) || !argv[i + 1] || argv[i + 1].startsWith("--")) throw new Error(`Unknown or incomplete option ${flag}. Run nixos-vps --help.`);
    if (result[flag] !== undefined) throw new Error(`Duplicate option ${flag}`);
    result[flag] = argv[++i];
  }
  return result;
}
function initialize(directory, opts, execute = runner.run, checkpoint = () => {}) {
  if (opts["--fix"]) throw new Error("--fix is only supported by validate");
  const stack = stackName(opts["--stack"] ?? "dev");
  if (!opts["--key-directory"] || !path.isAbsolute(opts["--key-directory"])) throw new Error("Provide --key-directory with an absolute path outside this project, e.g. $HOME/.ssh/my-nixos-vps");
  const keyDirectory = path.resolve(opts["--key-directory"]);
  const physicalProject = fs.realpathSync(directory);
  if (keyDirectory === directory || keyDirectory.startsWith(directory + path.sep)) throw new Error("Keep the key directory outside the project so private keys cannot enter Git or the Nix store");
  const choices = validateInputs({serverType:opts["--server-type"] ?? "cpx22",location:opts["--location"] ?? "nbg1",bootstrapImage:"ubuntu-24.04",
    tcpPorts:opts["--ports"] === undefined ? [80,443] : opts["--ports"].split(",").map(Number),sshSourceIps:["0.0.0.0/0","::/0"],sshTimeoutSeconds:600});
  const signature = {stack,keyDirectory,location:choices.location,serverType:choices.serverType,tcpPorts:choices.tcpPorts};
  const marker=path.join(directory,".nixos-vps-init.json");
  const exists=filename=>{try {fs.lstatSync(filename);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
  if(exists(marker)) {
    if(fs.lstatSync(marker).isSymbolicLink())throw new Error("Refusing to read a symlink initialization marker");
    let previous;try{previous=JSON.parse(fs.readFileSync(marker,"utf8"));}catch{throw new Error("Initialization marker is invalid; inspect the project manually. No files were changed.");}
    if(previous.version!==1 || !previous.keyDigests || JSON.stringify(previous.signature)!==JSON.stringify(signature))throw new Error("Refusing to overwrite: this project was initialized with different options or its marker is invalid. Edit its stack file; init never resets configuration.");
    const required=["Pulumi.yaml","index.ts","tsconfig.json","nixos",`Pulumi.${stack}.yaml`];
    if(required.some(name=>!exists(path.join(directory,name))))throw new Error("Initialization is incomplete or files were removed. Restore from backup; init will not regenerate keys or overwrite configuration.");
    for(const name of ["deploy","host"]) {
      const file=path.join(keyDirectory,name);
      if(!exists(file)||fs.lstatSync(file).isSymbolicLink()||runner.digest(fs.readFileSync(file))!==previous.keyDigests[name])throw new Error("Initialized key identity is missing or changed. Restore the original keys; init will not regenerate them.");
    }
    console.log("Already initialized. No keys or configuration changed; local edits are preserved.");return;
  }
  const template=path.resolve(__dirname,"../templates");
  for(const name of [...fs.readdirSync(template),`Pulumi.${stack}.yaml`])if(exists(path.join(directory,name)))throw new Error(`Refusing to overwrite ${name}. An existing or interrupted project requires manual inspection; init never replaces files or keys.`);
  fs.mkdirSync(path.dirname(keyDirectory),{recursive:true,mode:0o700});
  const parent=fs.realpathSync(path.dirname(keyDirectory));
  if(parent===physicalProject||parent.startsWith(physicalProject+path.sep))throw new Error("Key directory resolves inside the project through a symlink; choose an external directory");
  fs.mkdirSync(keyDirectory,{mode:0o700});
  const initialEntries=new Set(fs.readdirSync(directory));
  const owned=[],directories=[];
  let stage;
  const publish=(source,destination)=>{
    fs.copyFileSync(source,destination,fs.constants.COPYFILE_EXCL);
    owned.push({file:destination,ino:fs.lstatSync(destination).ino,hash:runner.digest(fs.readFileSync(destination))});
    checkpoint("published:"+path.relative(directory,destination));
  };
  try {
    stage=fs.mkdtempSync(path.join(directory,".nixos-vps-stage-"));fs.chmodSync(stage,0o700);
    for(const name of ["deploy","host"]) {
      execute("ssh-keygen",["-q","-t","ed25519","-N","","-f",path.join(keyDirectory,name)],{env:runner.childEnvironment(process.env)});
      fs.chmodSync(path.join(keyDirectory,name),0o600);checkpoint("key:"+name);
    }
    fs.cpSync(template,stage,{recursive:true});
    fs.copyFileSync(path.join(keyDirectory,"deploy.pub"),path.join(stage,"nixos/admin.pub"),fs.constants.COPYFILE_EXCL);
    fs.writeFileSync(path.join(stage,"nixos/ports.json"),JSON.stringify(choices.tcpPorts)+"\n");
    const config=Object.fromEntries(Object.entries({sshPublicKeyPath:path.join(keyDirectory,"deploy.pub"),sshPrivateKeyPath:path.join(keyDirectory,"deploy"),sshHostKeyPrivatePath:path.join(keyDirectory,"host"),serverType:choices.serverType,location:choices.location,tcpPorts:choices.tcpPorts,expectedDisk:"/dev/sda"}).map(([name,value])=>["standalone-nixos:"+name,value]));
    fs.writeFileSync(path.join(stage,`Pulumi.${stack}.yaml`),YAML.stringify({config}),{mode:0o600});
    if(!exists(path.join(directory,".gitignore")))fs.writeFileSync(path.join(stage,".gitignore"),require("./ignore-rules.cjs"));
    const keyDigests=Object.fromEntries(["deploy","host"].map(name=>[name,runner.digest(fs.readFileSync(path.join(keyDirectory,name)))]));
    fs.writeFileSync(path.join(stage,".nixos-vps-init.json"),JSON.stringify({version:1,signature,keyDigests},null,2)+"\n");
    function commit(from,to) {
      for(const entry of fs.readdirSync(from,{withFileTypes:true})) {
        if(entry.name===".nixos-vps-init.json")continue;
        const source=path.join(from,entry.name),target=path.join(to,entry.name);
        if(entry.isDirectory()){fs.mkdirSync(target);directories.push(target);commit(source,target);}
        else publish(source,target);
      }
    }
    checkpoint("staged");commit(stage,directory);
    // Completion marker is the commit point and is always published last.
    publish(path.join(stage,".nixos-vps-init.json"),marker);
  } catch(error) {
    let clean=true;
    for(const item of owned.reverse()) {
      try{if(fs.lstatSync(item.file).isFile()&&fs.lstatSync(item.file).ino===item.ino&&runner.digest(fs.readFileSync(item.file))===item.hash)fs.unlinkSync(item.file);else clean=false;}catch(e){if(e.code!=="ENOENT")clean=false;}
    }
    for(const dir of directories.reverse())try{fs.rmdirSync(dir);}catch{clean=false;}
    if(fs.readdirSync(directory).some(name=>!initialEntries.has(name)&&name!==path.basename(stage ?? "")))clean=false;
    if(clean)fs.rmSync(keyDirectory,{recursive:true,force:true});
    else error.message+=" Rollback found externally changed files; keys were preserved. Inspect this partial project manually before retrying.";
    throw error;
  } finally {if(stage)fs.rmSync(stage,{recursive:true,force:true});}
  console.log(`Initialized stack ${stack}. Two distinct Ed25519 key pairs are external (directory 0700, private files 0600). Existing .gitignore was preserved if present.\nEdit Pulumi.${stack}.yaml; next: npx nixos-vps validate --stack ${stack}. No cloud access occurred.`);
}
function validate(directory, opts, execute = runner.run) {
  for (const flag of Object.keys(opts)) if (flag !== "--stack" && flag !== "--fix") throw new Error(`${flag} is only supported by init; edit the Pulumi stack file before validation`);
  const c = loadProject(directory, opts["--stack"] ?? "dev");
  const env = { ...runner.childEnvironment(process.env), PULUMI_SKIP_UPDATE_CHECK: "true", PULUMI_CLI_TELEMETRY_OPTOUT: "1" };
  const local = (binary,args,settings={})=>execute(binary,args,{...settings,env});
  const pulumi = local("pulumi",["version"]);
  if (!/^v?3\./.test(pulumi)) throw new Error("Pulumi CLI v3 is required; install it before deployment. Validation never logs in or contacts a backend.");
  let tsc;
  try { tsc=createRequire(path.join(directory,"package.json")).resolve("typescript/bin/tsc"); }
  catch { throw new Error("TypeScript is missing. Run npm install --ignore-scripts --save-dev typescript @types/node in this project."); }
  try { local(process.execPath,[tsc,"--noEmit","--project",path.join(directory,"tsconfig.json")]); }
  catch { throw new Error("TYPESCRIPT_CHECK: the Pulumi project does not type-check. Run npx tsc --noEmit --project tsconfig.json in this directory for compiler diagnostics; fix those errors before deployment."); }
  console.log(`PASS: stack ${c.stack} inputs, Pulumi CLI and TypeScript. Credentials and provider availability are intentionally not checked.`);
  const flake = path.join(directory,"nixos");
  // Only public port data enters the Nix flake. No stack file or credential is copied.
  const portsFile = path.join(flake,"ports.json");
  if (!fs.existsSync(portsFile) || fs.lstatSync(portsFile).isSymbolicLink() || fs.lstatSync(flake).isSymbolicLink()) throw new Error("Missing regular nixos/ports.json; use the bundled template. Refusing to write through a symlink.");
  const before=fs.readFileSync(portsFile);
  let current;try{current=JSON.parse(before);}catch{throw new Error("Invalid nixos/ports.json; inspect the file before applying a fix.");}
  const normalize=ports=>JSON.stringify([...new Set(ports)].sort((a,b)=>a-b));
  if(!Array.isArray(current)||current.some(p=>!Number.isInteger(p)||p<1||p>65535))throw new Error("Invalid nixos/ports.json; expected an array of TCP port numbers.");
  let backup;
  if(normalize(current)!==normalize(c.tcpPorts)) {
    if(!opts["--fix"])throw new Error(`PORTS_OUT_OF_SYNC: nixos/ports.json differs from stack ${c.stack}. No configuration was changed. Review tcpPorts, then run npx nixos-vps validate --stack ${c.stack} --fix to synchronize explicitly.`);
    backup=portsFile+".backup-"+require("node:crypto").randomUUID();
    fs.copyFileSync(portsFile,backup,fs.constants.COPYFILE_EXCL);
    replacePorts(portsFile,Buffer.from(JSON.stringify([...new Set(c.tcpPorts)])+"\n"));
    console.log(`Explicit --fix: updated public nixos/ports.json. Original saved to ${backup}; restore it to undo this change.`);
  }
  try {
  const config = runner.settings({
    NIXOS_FLAKE_DIRECTORY: flake, NIXOS_CONFIGURATION: "web", NIXOS_INSTALLER: `${flake}#nixos-anywhere`,
    NIXOS_PUBLIC_KEY_PATH:c.sshPublicKeyPath,NIXOS_PRIVATE_KEY_PATH:c.sshPrivateKeyPath,NIXOS_HOST_KEY_PATH:c.sshHostKeyPrivatePath,
    NIXOS_EXPECTED_DISK:c.expectedDisk,NIXOS_EXPECTED_DISK_SERIAL:c.expectedDiskSerial,NIXOS_SSH_TIMEOUT:String(c.sshTimeoutSeconds),NIXOS_TCP_PORTS:JSON.stringify(c.tcpPorts),
  });
  runner.preflight(config,local);
  }
  catch(error) { if(backup){replacePorts(portsFile,before);console.error("Validation failed; the ports change was rolled back. Original backup was retained.");} throw error; }
  console.log(`PASS: distinct keys and permissions, root authorized key, locked x86_64 NixOS/disko, expected disk, OS firewall ports, production system build and checksum-pinned strict installer.\nLOCAL VALIDATION PASSED for stack ${c.stack}. No provider API, SSH connection, backend login or cloud resource operation was performed. Public Nix downloads may have occurred.\nConfiguration is unchanged unless an explicit --fix was applied successfully. Commit source and lockfiles before deployment; this result does not verify real Hetzner capacity, cloud-init, networking or kexec.`);
}
function replacePorts(file,bytes) {
  const temporary=file+"."+require("node:crypto").randomUUID()+".tmp";
  try {fs.writeFileSync(temporary,bytes,{flag:"wx",mode:0o644});fs.renameSync(temporary,file);}
  finally {if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
}
function main(argv=process.argv.slice(2)) {
  const [command,...args]=argv;
  if (!command || command==="--help") {console.log("nixos-vps init --key-directory /absolute/external/path [--stack dev] [--location nbg1] [--server-type cpx22] [--ports 80,443]\nnixos-vps validate --stack dev [--fix]\ninit writes a new local project and private keys; validate inspects local inputs/builds without editing configuration. --fix explicitly synchronizes public ports with a reversible backup. Neither command deploys or accesses Hetzner.");return;}
  const opts=options(args),directory=process.cwd();
  if(command==="init")initialize(directory,opts);
  else if(command==="validate")validate(directory,opts);
  else throw new Error("Unknown command. Run nixos-vps --help.");
}
module.exports={initialize,validate,main,options};
if(require.main===module)try{main();}catch(error){console.error(error.code==="EEXIST"?"Path already exists. Choose a NEW external key directory; existing keys are never overwritten.":error.message);process.exitCode=1;}
