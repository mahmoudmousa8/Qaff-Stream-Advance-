const fs = require('fs');
const path = require('path');

const pagePath = path.join(__dirname, '..', 'src', 'app', 'page.tsx');
const content = fs.readFileSync(pagePath, 'utf8');

const lines = content.split('\n');
lines.forEach((line, index) => {
  if (line.includes('bulk') || line.includes('Start All') || line.includes('الكل') || line.includes('startAll')) {
    console.log(`${index + 1}: ${line.trim()}`);
  }
});
