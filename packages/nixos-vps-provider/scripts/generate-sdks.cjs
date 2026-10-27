#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {contract,checkTools}=require('./distribution.cjs');

function generate(destination, options={}) {
  const output=path.resolve(destination);
  if(fs.existsSync(output)&&(fs.lstatSync(output).isSymbolicLink()||!fs.statSync(output).isDirectory()||fs.readdirSync(output).length)) {
    throw Error('SDK output must be a new or empty real directory; existing files are never overwritten');
  }
  checkTools();
  fs.mkdirSync(output,{recursive:true,mode:0o700});
  const schema=path.join(__dirname,'../schema.json');
  for(const language of ['nodejs','python','go']) {
    const result=cp.spawnSync('pulumi',['package','gen-sdk',schema,'--language',language,'--out',output],{encoding:'utf8',timeout:120000,env:options.env||process.env});
    if(result.status!==0)throw Error('SDK generation failed for '+language+': '+(result.stderr||result.error?.message||''));
  }
  // Generated SDKs stay local until runtime/migration and distribution tests pass.
  // Engine-driven plugin acquisition does not require an npm install hook.
  const node=path.join(output,'nodejs/package.json');
  const version=require('../package.json').version;
  const metadata=JSON.parse(fs.readFileSync(node));metadata.private=true;metadata.version=version;
  metadata.name=contract.npmPackage;
  metadata.license='MIT';metadata.repository={type:'git',url:'https://github.com/sgomezsal/nixos-vps.git'};
  metadata.dependencies={'@pulumi/pulumi':require('../runtime/package.json').dependencies['@pulumi/pulumi']};
  metadata.devDependencies={'typescript':contract.tools.typescript,'@types/node':contract.tools.nodeTypes};
  metadata.engines={node:'>=22'};
  metadata.main='bin/index.js';metadata.types='bin/index.d.ts';metadata.files=['bin','README.md'];
  if(metadata.scripts)delete metadata.scripts.postinstall;
  fs.writeFileSync(node,JSON.stringify(metadata,null,2)+'\n');
  fs.rmSync(path.join(output,'nodejs/scripts/postinstall.js'),{force:true});
  const utilities=path.join(output,'nodejs/utilities.ts');
  const utilitiesSource=fs.readFileSync(utilities,'utf8');
  const lookup="require('./package.json')";
  if(!utilitiesSource.includes(lookup))throw Error('Review changed Node SDK metadata lookup template');
  // This SDK keeps package.json at its root and compiled JavaScript in bin/.
  fs.writeFileSync(utilities,utilitiesSource.replaceAll(lookup,"require('../package.json')"));
  const schemaDocument=JSON.parse(fs.readFileSync(schema));
  const module=schemaDocument.language.go.importBasePath;
  fs.writeFileSync(path.join(output,'go/nixosvps/go.mod'),`module ${module}\n\ngo 1.24.0\n\nrequire github.com/pulumi/pulumi/sdk/v3 v${contract.tools.pulumi}\n`);
  const pep440=version.replace(/-dev\.(\d+)$/,'.dev$1');
  if(!/^\d+\.\d+\.\d+(?:\.dev\d+)?$/.test(pep440))throw Error('Add an explicit Python version mapping before generating another prerelease kind');
  const setup=path.join(output,'python/setup.py');
  const setupSource=fs.readFileSync(setup,'utf8');
  if(!setupSource.includes('VERSION = "0.0.0"'))throw Error('Review changed Python codegen version template');
  if(!setupSource.includes("setup(name='pulumi_nixos_vps'"))throw Error('Review changed Python distribution-name template');
  fs.writeFileSync(setup,setupSource.replace('VERSION = "0.0.0"',`VERSION = "${pep440}"`)
    .replace("setup(name='pulumi_nixos_vps'",`setup(name='${contract.pythonDistribution}'`)
    .replace(/'parver[^']*'/,`'parver==${contract.tools.parver}'`)
    .replace(/'pulumi>[^']*'/,`'pulumi==${contract.tools.pythonPulumi}'`)
    .replace(/'semver[^']*'/,`'semver==${contract.tools.semver}'`));
  const goVersion=path.join(output,'go/nixosvps/internal/pulumiVersion.go');
  const goSource=fs.readFileSync(goVersion,'utf8');
  if(!goSource.includes('var SdkVersion semver.Version = semver.Version{}'))throw Error('Review changed Go codegen version template');
  fs.writeFileSync(goVersion,goSource.replace('var SdkVersion semver.Version = semver.Version{}',`var SdkVersion semver.Version = semver.MustParse("${version}")`));
  for(const file of ['go/nixosvps/pulumi-plugin.json','python/pulumi_nixos_vps/pulumi-plugin.json']) {
    const location=path.join(output,file),plugin=JSON.parse(fs.readFileSync(location));
    fs.writeFileSync(location,JSON.stringify({...plugin,version},null,2)+'\n');
  }
  const readme=`# nixos-vps\n\nExperimental Pulumi component SDK (${version}).\n\nCreates a new Hetzner server, firewall and SSH key registration, then installs\nNixOS using the shared nixos-vps installer. Installation formats the target disk.\nNode.js 22+, Nix, OpenSSH and Pulumi are required on x86_64 Linux for every SDK.\n\nThis preview has not been published. Install the matching locally validated\nplugin and SDK artifacts; see the [multi-language guide](https://github.com/sgomezsal/nixos-vps/blob/main/docs/multilanguage.md)\nfor examples, prerequisites and the tested migration limits.\n\nThe original npm package nixos-vps remains a separate TypeScript interface.\nThis SDK delegates to the same component through the local provider process.\n\nLicensed under MIT.\n`;
  for(const directory of ['nodejs','python','go/nixosvps']) {
    fs.writeFileSync(path.join(output,directory,'README.md'),readme);
    fs.copyFileSync(path.join(__dirname,'../LICENSE'),path.join(output,directory,'LICENSE'));
  }
  return output;
}
module.exports={generate};
if(require.main===module) {
  try {
    if(process.argv.length!==3)throw Error('Usage: node generate-sdks.cjs /new/output/directory');
    console.log('Generated unreleased local SDKs in '+generate(process.argv[2]));
  }catch(error){console.error(error.message);process.exitCode=1;}
}
