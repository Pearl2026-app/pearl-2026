// Sample product artwork (SVG) so the catalogue looks complete before real photography arrives.
// Clearly illustrative; the admin replaces these with photographs.

const COLOURS: Record<string, [string, string, string]> = {
  White: ['#ffffff', '#efeae2', '#cfc8bd'],
  Cream: ['#fffaf0', '#f1e3c8', '#cdb994'],
  Rose: ['#fff6f4', '#f1d6d1', '#cfa9a2'],
  Golden: ['#fff6dc', '#ebcf8f', '#b8924b'],
  Silver: ['#ffffff', '#dfe3e6', '#a9b1b8'],
  Black: ['#8a8f99', '#3a3f48', '#16181c'],
  Lavender: ['#fbf7ff', '#e2d6ef', '#b4a3c9'],
};

let gid = 0;
function pearl(cx: number, cy: number, r: number, colour: string): string {
  const [hi, mid, lo] = COLOURS[colour] ?? COLOURS.White!;
  const id = `g${gid++}`;
  return `<defs><radialGradient id="${id}" cx="35%" cy="30%" r="75%"><stop offset="0%" stop-color="${hi}"/><stop offset="55%" stop-color="${mid}"/><stop offset="100%" stop-color="${lo}"/></radialGradient></defs><circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id})"/><ellipse cx="${cx - r * 0.35}" cy="${cy - r * 0.4}" rx="${r * 0.22}" ry="${r * 0.12}" fill="#fff" opacity=".55"/>`;
}

const gold = '#b9975b';

export function productSvg(kind: string, colour: string, variant = 0): string {
  gid = 0;
  const bg = variant % 2 === 0 ? '#f6f1e9' : '#f3eee6';
  let body = '';
  switch (kind) {
    case 'necklaces': {
      for (let i = 0; i <= 16; i++) {
        const t = Math.PI * (0.12 + (0.76 * i) / 16);
        body += pearl(400 + Math.cos(t) * 250, 260 + Math.sin(t) * 260, 26, colour);
      }
      break;
    }
    case 'earrings':
      body += `<path d="M300 220 v80 M500 220 v80" stroke="${gold}" stroke-width="6" fill="none"/>`;
      body += `<circle cx="300" cy="210" r="14" fill="none" stroke="${gold}" stroke-width="6"/><circle cx="500" cy="210" r="14" fill="none" stroke="${gold}" stroke-width="6"/>`;
      body += pearl(300, 370, 70, colour) + pearl(500, 370, 70, colour);
      break;
    case 'rings':
      body += `<ellipse cx="400" cy="470" rx="150" ry="150" fill="none" stroke="${gold}" stroke-width="22"/>`;
      body += `<path d="M350 330 q50 -40 100 0" stroke="${gold}" stroke-width="10" fill="none"/>`;
      body += pearl(400, 270, 85, colour);
      break;
    case 'bracelets':
      for (let i = 0; i < 18; i++) {
        const t = (2 * Math.PI * i) / 18;
        body += pearl(400 + Math.cos(t) * 220, 400 + Math.sin(t) * 150, 32, colour);
      }
      break;
    case 'pendants':
      body += `<path d="M180 120 Q400 420 620 120" stroke="${gold}" stroke-width="4" fill="none"/>`;
      body += `<path d="M400 265 v60" stroke="${gold}" stroke-width="6"/>`;
      body += pearl(400, 420, 95, colour);
      break;
    default:
      body += pearl(320, 420, 110, colour) + pearl(500, 360, 80, colour) + pearl(470, 520, 60, colour);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800"><rect width="800" height="800" fill="${bg}"/>${body}<text x="400" y="770" text-anchor="middle" font-family="Georgia, serif" font-size="18" fill="#9a8f80" letter-spacing="4">SAMPLE IMAGE</text></svg>`;
}

export function sceneSvg(title: string, tone: 'water' | 'farm' | 'craft' = 'water'): string {
  gid = 0;
  const palettes = {
    water: ['#1f4e52', '#3f7a7a', '#a9c7c1'],
    farm: ['#2f4a3a', '#5d7d5f', '#d6e0cc'],
    craft: ['#4a3b2a', '#8a6d4b', '#e8dccb'],
  }[tone];
  const [a, b, c] = palettes;
  let pearls = '';
  for (let i = 0; i < 7; i++) pearls += pearl(260 + i * 115, 560 + (i % 2) * 30, 34, 'White');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" width="1600" height="900"><defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="1600" height="900" fill="url(#sky)"/><path d="M0 520 Q400 440 800 520 T1600 500 V900 H0Z" fill="${a}" opacity=".85"/><path d="M0 640 Q400 600 800 650 T1600 630 V900 H0Z" fill="${b}" opacity=".6"/>${pearls}<text x="800" y="840" text-anchor="middle" font-family="Georgia, serif" font-size="30" fill="#fbf8f3" letter-spacing="6">${title.toUpperCase()} · SAMPLE IMAGE</text></svg>`;
}
