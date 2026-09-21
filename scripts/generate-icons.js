const sharp = require('sharp');
const path  = require('path');
const fs    = require('fs');

const SVG     = path.join(__dirname, '../assets/icon.svg');
const ASSETS  = path.join(__dirname, '../assets');

const icons = [
  { name: 'icon.png',          size: 1024 },
  { name: 'adaptive-icon.png', size: 1024 },
  { name: 'splash-icon.png',   size: 200  },
  { name: 'favicon.png',       size: 64   },
];

async function main() {
  const svg = fs.readFileSync(SVG);
  for (const { name, size } of icons) {
    const dest = path.join(ASSETS, name);
    await sharp(svg)
      .resize(size, size)
      .png()
      .toFile(dest);
    console.log(`✔  ${name}  (${size}x${size})`);
  }

  // splash.png: 1242x2436 fundo escuro com ícone centralizado
  const splashBuf = await sharp(svg).resize(400, 400).png().toBuffer();
  await sharp({
    create: { width: 1242, height: 2436, channels: 4, background: { r: 15, g: 39, b: 68, alpha: 1 } }
  })
    .composite([{ input: splashBuf, gravity: 'center' }])
    .png()
    .toFile(path.join(ASSETS, 'splash.png'));
  console.log('✔  splash.png  (1242x2436)');

  console.log('\nÍcones gerados com sucesso!');
}

main().catch(console.error);
