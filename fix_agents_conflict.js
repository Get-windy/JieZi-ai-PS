const fs = require('fs');
const filePath = 'i:/JieZI/JieZi-ai-PS/ui/src/ui/views/agents.ts';

const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

console.log('Total lines:', lines.length);

// 找冲突标记
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('upstream/main') || lines[i].trimEnd() === '=======') {
    console.log('CONFLICT L' + (i+1) + ': ' + JSON.stringify(lines[i].substring(0, 80)));
  }
}

// 找问题区域关键行
for (let i = Math.max(0, 2180); i < Math.min(lines.length, 2280); i++) {
  console.log('L' + (i+1) + ': ' + JSON.stringify(lines[i].substring(0, 100)));
}
