const sharp = require('sharp');
const path = require('path');

const svgPath = path.join(__dirname, '../media/icon.svg');
const pngPath = path.join(__dirname, '../media/icon.png');

// 创建一个带有背景色的 PNG 图标
const svgWithBackground = `
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <rect width="256" height="256" fill="#1e1e1e" rx="32"/>
  <g transform="translate(80, 80) scale(4)" stroke="#007acc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none">
    <path d="M12 2L2 7l10 5 10-5-10-5z"/>
    <path d="M2 17l10 5 10-5"/>
    <path d="M2 12l10 5 10-5"/>
  </g>
</svg>
`;

sharp(Buffer.from(svgWithBackground))
  .resize(256, 256)
  .png()
  .toFile(pngPath)
  .then(() => {
    console.log('Icon converted successfully:', pngPath);
  })
  .catch((err) => {
    console.error('Error converting icon:', err);
    process.exit(1);
  });
