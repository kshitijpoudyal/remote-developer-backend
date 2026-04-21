// Generates icon-192.png and icon-512.png using node-canvas or SVG fallback
// Run: node scripts/gen-icons.js
const fs = require('fs');
const path = require('path');

function svgIcon(size) {
  const r = Math.round(size * 0.18);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${r}" fill="#0d0f14"/>
  <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle"
    font-family="monospace" font-size="${Math.round(size*0.52)}" font-weight="bold" fill="#4f8ef7">&#x25B8;</text>
</svg>`;
}

const outDir = path.join(__dirname, '../public');

fs.writeFileSync(path.join(outDir, 'icon-192.svg'), svgIcon(192));
fs.writeFileSync(path.join(outDir, 'icon-512.svg'), svgIcon(512));

console.log('SVG icons written to public/. For PNG, convert with: npx sharp-cli or use an online converter.');
console.log('Or just use the SVG files — update manifest.json to reference .svg instead of .png.');
