const fs = require('fs');
const path = require('path');

function copyFolderRecursiveSync(source, target) {
  if (!fs.existsSync(source)) return;

  // Create target directory if it doesn't exist
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }

  // Read files/folders in source
  const files = fs.readdirSync(source);

  for (const file of files) {
    const curSource = path.join(source, file);
    const curTarget = path.join(target, file);

    if (fs.lstatSync(curSource).isDirectory()) {
      copyFolderRecursiveSync(curSource, curTarget);
    } else {
      fs.copyFileSync(curSource, curTarget);
    }
  }
}

// Target paths
const rootDir = path.resolve(__dirname, '..');
const staticSrc = path.join(rootDir, '.next', 'static');
const staticDst = path.join(rootDir, '.next', 'standalone', '.next', 'static');
const publicSrc = path.join(rootDir, 'public');
const publicDst = path.join(rootDir, '.next', 'standalone', 'public');

console.log('Copying static files for standalone build...');
try {
  copyFolderRecursiveSync(staticSrc, staticDst);
  console.log(`Successfully copied ${staticSrc} -> ${staticDst}`);
} catch (err) {
  console.error('Failed to copy static files:', err.message);
}

try {
  copyFolderRecursiveSync(publicSrc, publicDst);
  console.log(`Successfully copied ${publicSrc} -> ${publicDst}`);
} catch (err) {
  console.error('Failed to copy public folder:', err.message);
}

console.log('Standalone build assets copy completed!');
