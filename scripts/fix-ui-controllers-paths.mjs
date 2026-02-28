import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const uiSrcDir = path.join(rootDir, 'ui', 'src', 'ui');

let count = 0;

// 需要修复的子目录（都是4级深度）
const subdirs = ['controllers', 'views', 'chat'];

subdirs.forEach(subdir => {
  const targetDir = path.join(uiSrcDir, subdir);
  if (!fs.existsSync(targetDir)) return;
  
  const files = fs.readdirSync(targetDir).filter(f => f.endsWith('.ts'));
  
  files.forEach(file => {
    const filePath = path.join(targetDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    const original = content;
    
    // 修复 ../../../upstream/src/ 为 ../../../../upstream/src/
    content = content.replace(/(['"])(\.\.\/)(\.\.\/)(\.\.\/)upstream\/src\//g, '$1$2$3$4../upstream/src/');
    
    if (content !== original) {
      fs.writeFileSync(filePath, content);
      count++;
      console.log(`Fixed: ${subdir}/${file}`);
    }
  });
});

console.log(`\nTotal fixed: ${count} files`);
