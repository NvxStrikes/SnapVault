const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, 'node_modules', 'jspdf', 'dist', 'jspdf.umd.min.js');
const destDir = path.join(__dirname, 'libs');
const dest = path.join(destDir, 'jspdf.umd.min.js');

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

if (fs.existsSync(src)) {
  fs.copyFileSync(src, dest);
  console.log('Successfully copied jsPDF to libs/jspdf.umd.min.js');
} else {
  console.error(`Source jsPDF file not found at ${src}. Make sure you run npm install first.`);
  process.exit(1);
}
