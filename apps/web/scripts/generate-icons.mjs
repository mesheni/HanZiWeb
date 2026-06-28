import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

const icon = {
  create: {
    width: 512,
    height: 512,
    channels: 4,
    background: { r: 12, g: 14, b: 22, alpha: 1 },
  },
};

async function generate() {
  const bgSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="64" fill="#0C0E16"/>
  <text x="256" y="320" text-anchor="middle" font-family="sans-serif" font-size="260" fill="#DC2626" font-weight="bold">汉</text>
</svg>`;

  await sharp(Buffer.from(bgSvg))
    .resize(192, 192)
    .png()
    .toFile(join(publicDir, 'icon-192.png'));

  await sharp(Buffer.from(bgSvg))
    .resize(512, 512)
    .png()
    .toFile(join(publicDir, 'icon-512.png'));

  console.log('PWA icons generated.');
}

generate().catch(console.error);
