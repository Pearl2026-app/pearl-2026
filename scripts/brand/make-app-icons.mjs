// Generates app icons and splash images from the pearl mark. Run: node scripts/brand/make-app-icons.mjs
// Uses sharp from the API workspace. Output goes to each app's assets folder.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const sharp = createRequire(join(root, 'apps/api/package.json'))('sharp');

const TEAL = '#1F4E52';
const pearl = (cx, cy, r) => `
  <defs>
    <radialGradient id="p" cx="38%" cy="32%" r="70%">
      <stop offset="0%" stop-color="#FFFFFF"/><stop offset="55%" stop-color="#F1ECE3"/><stop offset="100%" stop-color="#CFC6B8"/>
    </radialGradient>
  </defs>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#p)"/>
  <ellipse cx="${cx - r * 0.32}" cy="${cy - r * 0.36}" rx="${r * 0.22}" ry="${r * 0.13}" fill="#FFFFFF" opacity="0.85" transform="rotate(-30 ${cx - r * 0.32} ${cy - r * 0.36})"/>`;

/** variant: 'customer' = pearl only; 'delivery' = pearl with a small gold arrow badge. */
function markSvg(size, { background = true, variant = 'customer', scale = 1 } = {}) {
  const c = size / 2;
  const r = size * 0.27 * scale;
  const badge =
    variant === 'delivery'
      ? `<circle cx="${c + r * 0.85}" cy="${c + r * 0.85}" r="${r * 0.42}" fill="#B08D57"/>
         <path d="M${c + r * 0.62} ${c + r * 0.85} h${r * 0.42} m-${r * 0.16} -${r * 0.16} l${r * 0.16} ${r * 0.16} l-${r * 0.16} ${r * 0.16}" stroke="#FFFFFF" stroke-width="${r * 0.08}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
      : `<circle cx="${c}" cy="${c}" r="${r * 1.32}" fill="none" stroke="#B08D57" stroke-width="${size * 0.012}"/>`;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    ${background ? `<rect width="${size}" height="${size}" fill="${TEAL}"/>` : ''}
    ${pearl(c, c, r)}
    ${badge}
  </svg>`);
}

async function make(app, variant) {
  const out = join(root, 'apps', app, 'assets');
  mkdirSync(out, { recursive: true });
  await sharp(markSvg(1024, { variant })).png().toFile(join(out, 'icon.png'));
  // Android adaptive icon: transparent foreground inside the 66% safe zone.
  await sharp(markSvg(1024, { variant, background: false, scale: 0.72 })).png().toFile(join(out, 'adaptive-icon.png'));
  await sharp(markSvg(512, { variant, background: false })).png().toFile(join(out, 'splash-icon.png'));
  console.log(`${app}: icon.png, adaptive-icon.png, splash-icon.png`);
}

await make('mobile-delivery', 'delivery');
if (process.argv.includes('--customer')) await make('mobile-customer', 'customer');
