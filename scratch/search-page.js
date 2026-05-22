import fs from 'fs';

const content = fs.readFileSync('src/app/page.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, index) => {
  if (line.includes('fetch(') || line.includes('/api/')) {
    console.log(`${index + 1}: ${line.trim()}`);
  }
});
