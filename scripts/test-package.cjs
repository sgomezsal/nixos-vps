// Consume the actual tarball in an unrelated project; never invoke a cloud CLI.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "nixos-package-review-"));
const root = path.resolve(__dirname, "..");
const keyDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "nixos-consumer-keys-"));
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 300000,
    env: { ...process.env, NODE_PATH: "", HCLOUD_TOKEN: "", PULUMI_ACCESS_TOKEN: "" }, ...options });
  assert.equal(result.status, 0, result.stderr || result.stdout || result.error?.message);
  return result.stdout;
}
try {
  const [artifact] = JSON.parse(run("npm", ["pack", "--workspace", "nixos-vps", "--ignore-scripts", "--json", "--pack-destination", temporary]));
  const files = artifact.files.map(file => file.path);
  for (const required of ["lib/index.js", "lib/index.d.ts", "scripts/runner.cjs", "README.md", "LICENSE", "templates/index.ts", "templates/nixos/flake.lock", "templates/nixos/base.nix", "templates/nixos/disk-config.nix", "templates/nixos/secure-installer.nix", "templates/nixos/ports.json", "scripts/cli.cjs", "scripts/project.cjs", "scripts/ignore-rules.cjs"]) assert.ok(files.includes(required), required);
  assert.ok(files.every(file => /^(lib\/|scripts\/|templates\/|README.md$|LICENSE$|package.json$)/.test(file)), files.join("\n"));
  assert.ok(files.every(file => !/(?:^|\/)secrets\//.test(file) && !file.endsWith(".pub") && !file.endsWith(".env")), "Fixture keys and operator credential examples must not enter the package");
  fs.writeFileSync(path.join(temporary, "package.json"), JSON.stringify({ name: "local-consumer-test", private: true }));
  const typescript = require("typescript/package.json").version;
  const nodeTypes = require("@types/node/package.json").version;
  run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", path.join(temporary, artifact.filename), `typescript@${typescript}`, `@types/node@${nodeTypes}`], { cwd: temporary });
  const installed = path.join(temporary, "node_modules/nixos-vps");
  assert.ok(!fs.lstatSync(installed).isSymbolicLink());
  assert.equal(fs.existsSync(path.join(installed,"templates/nixos/admin.pub")),false);
  run(path.join(temporary, "node_modules/.bin/nixos-vps"), ["init", "--stack", "offline", "--key-directory", path.join(keyDirectory,"identity"), "--location", "fsn1", "--server-type", "cpx32", "--ports", "80,8080"], {cwd:temporary});
  const identityBefore = fs.readFileSync(path.join(keyDirectory,"identity/host"));
  const again = run(path.join(temporary,"node_modules/.bin/nixos-vps"),["init","--stack","offline","--key-directory",path.join(keyDirectory,"identity"),"--location","fsn1","--server-type","cpx32","--ports","80,8080"],{cwd:temporary});
  assert.match(again,/Already initialized/);
  assert.ok(identityBefore.equals(fs.readFileSync(path.join(keyDirectory,"identity/host"))));
  fs.writeFileSync(path.join(temporary, "types.cts"), `import {NixosServer, type NixosServerArgs} from 'nixos-vps';
    const args: NixosServerArgs = {flakeDirectory: '/not-read-in-preview', configuration: 'web', installer: '/tool#nixos-anywhere', sshPublicKeyPath: '/key.pub', sshPrivateKeyPath: '/key', sshHostKeyPrivatePath:'/host-key'};
    const typed = (): NixosServer => new NixosServer('typed', args);
    // @ts-expect-error configuration is required
    const invalid: NixosServerArgs = {flakeDirectory: '/missing'};
  `);
  fs.copyFileSync(path.join(temporary, "types.cts"), path.join(temporary, "types.mts"));
  run(path.join(temporary, "node_modules/.bin/tsc"), ["--noEmit", "--strict", "--skipLibCheck", "--target", "ES2020", "--module", "NodeNext", "--moduleResolution", "NodeNext", "index.ts", "types.cts", "types.mts"], { cwd: temporary });
  run(path.join(temporary, "node_modules/.bin/tsc"), ["--project", "tsconfig.json"], { cwd: temporary });
  run(process.execPath, ["--input-type=module", "-e", "import {NixosServer} from 'nixos-vps'; if(typeof NixosServer!=='function')process.exit(1)"], { cwd: temporary });
  fs.writeFileSync(path.join(temporary, "consume.cjs"), `
    const assert=require('node:assert/strict'); const Module=require('node:module');
    const original=Module._resolveFilename;
    Module._resolveFilename=function(...args){const resolved=original.apply(this,args);if(resolved.startsWith(${JSON.stringify(root + path.sep)}))throw new Error('Original repository dependency: '+resolved);return resolved;};
    const pulumi=require('@pulumi/pulumi');const {NixosServer}=require('nixos-vps');const resources=[];
    pulumi.runtime.setMocks({newResource(args){resources.push(args);return {id:args.type.includes('firewall')?'12':args.name+'-id',state:{...args.inputs,ipv4Address:'192.0.2.10',stdout:JSON.stringify({publicKey:'ssh-ed25519 AAAATEST fixture',hostPublicKey:'ssh-ed25519 AAAATEST fixture',hostKeyDigest:require('crypto').createHash('sha256').update('synthetic-host').digest('hex')})}};},call(){throw new Error('Unexpected provider call');}},'standalone-nixos','offline',false);
    require('fs').writeFileSync('host-key','synthetic-host',{mode:0o600});
    pulumi.runtime.setAllConfig({'standalone-nixos:sshPublicKeyPath':'/missing-key.pub','standalone-nixos:sshPrivateKeyPath':'/missing-key','standalone-nixos:sshHostKeyPrivatePath':process.cwd()+'/host-key','standalone-nixos:location':'fsn1','standalone-nixos:serverType':'cpx32','standalone-nixos:tcpPorts':'[80,8080]'});
    const example=require('./build/index.js');
    example.ipv4.apply(ip=>{assert.equal(ip,'192.0.2.10');assert.ok(resources.some(r=>r.name==='web-install'));const vm=resources.find(r=>r.name==='web-server');assert.equal(vm.inputs.location,'fsn1');assert.equal(vm.inputs.serverType,'cpx32');assert.ok(resources.find(r=>r.name==='web-firewall').inputs.rules.some(r=>r.port==='8080'));});
    const server=new NixosServer('independent',{flakeDirectory:process.cwd()+'/nixos',configuration:'web',installer:process.cwd()+'/nixos#nixos-anywhere',sshPublicKeyPath:'/missing-key.pub',sshPrivateKeyPath:'/missing-key',sshHostKeyPrivatePath:process.cwd()+'/host-key'});
    server.ipv4.apply(ip=>{assert.equal(ip,'192.0.2.10');assert.ok(resources.some(r=>r.name==='independent-install'));assert.ok(resources.every(r=>!JSON.stringify(r.inputs).includes(${JSON.stringify(root)})));console.log('Independent consumer instantiated the component with meaningful mocks.');});
  `);
  run(process.execPath, ["consume.cjs"], { cwd: temporary });
  run("npm", ["ls", "--omit=dev", "--all"], { cwd: temporary });
  if (process.argv.includes("--validate-local")) {
    const before=fs.readFileSync(path.join(temporary,"nixos/flake.lock"),"utf8");
    const sourceFiles=["Pulumi.yaml","Pulumi.offline.yaml","index.ts",".nixos-vps-init.json",...fs.readdirSync(path.join(temporary,"nixos")).map(name=>"nixos/"+name)];
    const snapshot=()=>sourceFiles.map(name=>{const file=path.join(temporary,name),stat=fs.statSync(file);return [name,require('crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex'),stat.mode,stat.mtimeMs];});
    const sourceBefore=snapshot();
    const output=run(path.join(temporary,"node_modules/.bin/nixos-vps"),["validate","--stack","offline"],{cwd:temporary,timeout:20*60*1000});
    assert.match(output,/LOCAL VALIDATION PASSED/);console.log(output.trim());
    assert.deepEqual(snapshot(),sourceBefore,'default validation changed source contents, modes or modification times');
    assert.equal(fs.readFileSync(path.join(temporary,"nixos/flake.lock"),"utf8"),before);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(temporary,"nixos/ports.json"))),[80,8080]);
    fs.writeFileSync(path.join(temporary,"nixos/ports.json"),'[80,443]\n');
    const mismatchBefore=snapshot();
    const refused=spawnSync(path.join(temporary,"node_modules/.bin/nixos-vps"),["validate","--stack","offline"],{cwd:temporary,encoding:"utf8",timeout:60000,env:{PATH:process.env.PATH,HOME:process.env.HOME}});
    assert.ok(!refused.error,refused.error?.message);assert.equal(refused.status,1);assert.match(refused.stderr,/PORTS_OUT_OF_SYNC/);assert.deepEqual(snapshot(),mismatchBefore);
    const fixed=run(path.join(temporary,"node_modules/.bin/nixos-vps"),["validate","--stack","offline","--fix"],{cwd:temporary,timeout:20*60*1000});
    assert.match(fixed,/Explicit --fix/);assert.match(fixed,/LOCAL VALIDATION PASSED/);
    const backups=fs.readdirSync(path.join(temporary,"nixos")).filter(name=>name.startsWith('ports.json.backup-'));
    assert.equal(backups.length,1);assert.equal(fs.readFileSync(path.join(temporary,"nixos",backups[0]),"utf8"),'[80,443]\n');
    console.log('READ-ONLY/FIX PASS: source hashes, modes and mtimes unchanged by default validation; mismatches refuse writes; explicit fix succeeds with original backup. Repeated installed init is a no-op.');
  }
  console.log(`Tarball: ${files.length} allowlisted files; independent CJS/ESM imports, type declarations, documented template, resource graph and runtime dependencies pass.`);
} finally { fs.rmSync(temporary, { recursive: true, force: true }); fs.rmSync(keyDirectory, {recursive:true,force:true}); }
