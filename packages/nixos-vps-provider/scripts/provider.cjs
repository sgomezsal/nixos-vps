#!/usr/bin/env node
'use strict';
// Importing the package never starts a server. Pulumi invokes this entry point.
if (require.main === module) {
  const {main}=require('@pulumi/pulumi/provider');
  const {NixosServerProvider}=require('../lib/provider.js');
  main(new NixosServerProvider(),process.argv.slice(2)).catch(() => {
    console.error('Component provider startup failed; inspect the Pulumi diagnostic context.');
    process.exitCode=1;
  });
}
