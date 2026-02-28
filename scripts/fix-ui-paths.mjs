import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function walkDir(dir, pattern, callback) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      walkDir(filePath, pattern, callback);
    } else if (pattern.test(file)) {
      callback(filePath);
    }
  });
}

let count = 0;
const uiSrcDir = path.join(rootDir, 'ui', 'src');

walkDir(uiSrcDir, /\.ts$/, file => {
  let content = fs.readFileSync(file, 'utf8');
  const original = content;
  
  // 修复 ../upstream/src/ 为 ../../../upstream/src/
  content = content.replace(/(['"])\.\.\/upstream\/src\//g, '$1../../../upstream/src/');
  
  if (content !== original) {
    fs.writeFileSync(file, content);
    count++;
    console.log(`Fixed: ${path.relative(rootDir, file)}`);
  }
});

console.log(`\nTotal fixed: ${count}`);
