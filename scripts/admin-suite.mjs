import { spawn } from 'node:child_process';

const children=[
  ['PROJECT ADMIN','scripts/admin-server.mjs'],
  ['BLOB ADMIN','scripts/blob-admin-server.mjs']
].map(([label,script])=>{
  const child=spawn(process.execPath,[script],{stdio:'inherit',windowsHide:true});
  child.on('exit',code=>{if(code&&code!==0)console.error(`${label} exited with code ${code}`);});
  return child;
});

console.log('Admin suite running:');
console.log('  Projects → http://localhost:4310');
console.log('  Blob     → http://localhost:4311');

const stop=()=>{for(const child of children)if(!child.killed)child.kill();process.exit(0);};
process.on('SIGINT',stop);
process.on('SIGTERM',stop);
