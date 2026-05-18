import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const distDir = join(process.cwd(), 'dist');

if (!existsSync(distDir)) {
  console.log('dist directory does not exist');
  process.exit(1);
}

const { globSync } = await import('glob');
const files = [
  ...globSync(join(distDir, 'plugin-loader-*.js')),
  ...globSync(join(distDir, 'monitor-*.js')),
];

console.log(`Found ${files.length} files to check`);

const fixes = [
  ['import { ConnectionOptions, TLSSocket } from "node:tls";', 'import { TLSSocket } from "node:tls";'],
  ['import { IpcNetConnectOpts, Socket, TcpNetConnectOpts } from "node:net";', 'import { Socket } from "node:net";'],
  ['import { IpcNetConnectOpts, TcpNetConnectOpts } from "node:net";', '// IpcNetConnectOpts and TcpNetConnectOpts removed from node:net in Node.js 24'],
];

let fixedCount = 0;

for (const file of files) {
  let content = readFileSync(file, 'utf8');
  let changed = false;
  
  for (const [oldStr, newStr] of fixes) {
    if (content.includes(oldStr)) {
      content = content.replace(oldStr, newStr);
      changed = true;
      fixedCount++;
      console.log(`Fixed: ${file}`);
    }
  }
  
  if (changed) {
    writeFileSync(file, content);
  }
}

console.log(`\nNode.js 24 compatibility fixes applied: ${fixedCount} files modified`);
