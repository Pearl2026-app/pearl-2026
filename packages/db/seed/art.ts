// Sample artwork (SVG) so the catalogue looks complete before real photography arrives.
// Drawn like studio photographs: layered nacre, rose orient, specular light and soft contact shadows.
// Each image carries a small "Sample image" mark; the admin replaces these with photographs.

type Tone = [hi: string, mid: string, lo: string, deep: string, orient: string];

const COLOURS: Record<string, Tone> = {
  White: ['#ffffff', '#f2f2ef', '#d9dbd7', '#a7adab', '#f2d6d2'],
  Cream: ['#fffdf7', '#f5ecda', '#dccba8', '#a8916a', '#f1d9c9'],
  Rose: ['#fffafa', '#f6e2de', '#dcb9b2', '#a98781', '#e6c4d6'],
  Golden: ['#fff9e6', '#f1d9a2', '#cfa65a', '#86652a', '#f8e7b2'],
  Silver: ['#ffffff', '#eaedef', '#c3cad0', '#868f98', '#d4e5ea'],
  Black: ['#a3abb5', '#4d5560', '#22272e', '#0c0f13', '#5f8f80'],
  Lavender: ['#fdfaff', '#ede3f5', '#c8b5d9', '#8f7c9b', '#d6e7ef'],
};

let gid = 0;
const uid = (p: string) => `${p}${gid++}`;

/** Shared filters and the gold metal gradient. */
function defs(): string {
  return `<defs>
<filter id="b2" x="-100%" y="-400%" width="300%" height="900%"><feGaussianBlur stdDeviation="2"/></filter>
<filter id="b6" x="-100%" y="-400%" width="300%" height="900%"><feGaussianBlur stdDeviation="6"/></filter>
<filter id="b14" x="-100%" y="-400%" width="300%" height="900%"><feGaussianBlur stdDeviation="14"/></filter>
<filter id="b40" x="-100%" y="-400%" width="300%" height="900%"><feGaussianBlur stdDeviation="40"/></filter>
<linearGradient id="metal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6b4f27"/><stop offset=".32" stop-color="#c39e5f"/><stop offset=".5" stop-color="#f4e3b6"/><stop offset=".68" stop-color="#b48c4c"/><stop offset="1" stop-color="#6b4f27"/></linearGradient>
</defs>`;
}

/** Soft shadow where a pearl meets the surface. */
function shadow(cx: number, cy: number, r: number, strength = 0.28, dark = '#0e1a22'): string {
  const f = r > 60 ? 'b14' : r > 25 ? 'b6' : 'b2';
  return `<ellipse cx="${cx + r * 0.12}" cy="${cy + r * 0.9}" rx="${r * 0.9}" ry="${r * 0.22}" fill="${dark}" opacity="${strength}" filter="url(#${f})"/>`;
}

/** One pearl: body, orient (the rose/green lustre), rim light, reflected light and highlight. */
function pearl(cx: number, cy: number, r: number, colour: string): string {
  const [hi, mid, lo, deep, orient] = COLOURS[colour] ?? COLOURS.White!;
  const body = uid('pb');
  const or = uid('po');
  const sp = uid('ps');
  return `<defs>
<radialGradient id="${body}" cx="36%" cy="30%" r="78%"><stop offset="0" stop-color="${hi}"/><stop offset=".42" stop-color="${mid}"/><stop offset=".8" stop-color="${lo}"/><stop offset="1" stop-color="${deep}"/></radialGradient>
<radialGradient id="${or}" cx="72%" cy="74%" r="62%"><stop offset="0" stop-color="${orient}" stop-opacity=".85"/><stop offset=".6" stop-color="${orient}" stop-opacity=".25"/><stop offset="1" stop-color="${orient}" stop-opacity="0"/></radialGradient>
<radialGradient id="${sp}"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".5" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
</defs>
<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${body})"/>
<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${or})"/>
<circle cx="${cx}" cy="${cy}" r="${r * 0.965}" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="${Math.max(1, r * 0.045)}"/>
<ellipse cx="${cx + r * 0.12}" cy="${cy + r * 0.62}" rx="${r * 0.46}" ry="${r * 0.14}" fill="#fff" opacity=".2" filter="url(#${r > 60 ? 'b6' : 'b2'})"/>
<ellipse cx="${cx - r * 0.33}" cy="${cy - r * 0.38}" rx="${r * 0.3}" ry="${r * 0.18}" transform="rotate(-32 ${cx - r * 0.33} ${cy - r * 0.38})" fill="url(#${sp})"/>
<circle cx="${cx - r * 0.4}" cy="${cy - r * 0.45}" r="${Math.max(0.8, r * 0.06)}" fill="#fff" opacity=".9"/>`;
}

/**
 * Pearls laid along a path, touching, sized by how far along the path they sit (0 at the start, 1 at the end).
 * Shadows go down first, then the pearls from back (top) to front (bottom).
 */
function strand(points: Array<[number, number]>, r: (f: number) => number, colour: string, shadowStrength = 0.24): string {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1]! + Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1]));
  const total = lengths[lengths.length - 1]!;
  const pearls: Array<readonly [number, number, number]> = [];
  let at = r(0);
  let k = 0;
  while (at < total - r(1) * 0.5) {
    while (k < lengths.length - 1 && lengths[k]! < at) k++;
    const rr = r(at / total);
    pearls.push([points[k]![0], points[k]![1], rr] as const);
    at += rr * 2.03;
  }
  return (
    pearls.map(([x, y, rr]) => shadow(x, y, rr, shadowStrength)).join('') +
    [...pearls].sort((a, b) => a[1] - b[1]).map(([x, y, rr]) => pearl(x, y, rr, colour)).join('')
  );
}

function curve(f: (t: number) => [number, number], steps = 900): Array<[number, number]> {
  return Array.from({ length: steps + 1 }, (_, i) => f(i / steps));
}

function mark(x: number, y: number, light = false): string {
  return `<text x="${x}" y="${y}" text-anchor="end" font-family="Jost, Futura, Helvetica, Arial, sans-serif" font-size="15" letter-spacing=".5" fill="${light ? '#ffffff' : '#7d888f'}" opacity=".6">Sample image</text>`;
}

/** A light studio sweep: cool pearl-white paper with a pool of light and a faint rose blush. */
function studio(variant: number): string {
  const [top, bottom] = variant % 2 === 0 ? ['#f9faf8', '#e2e6e4'] : ['#eef2f3', '#cfd8dc'];
  const bg = uid('bg');
  return `<defs><linearGradient id="${bg}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs>
<rect width="800" height="800" fill="url(#${bg})"/>
<ellipse cx="300" cy="230" rx="420" ry="300" fill="#fff" opacity=".7" filter="url(#b40)"/>
<ellipse cx="640" cy="700" rx="320" ry="160" fill="#ead6d0" opacity="${variant % 2 === 0 ? 0.45 : 0.3}" filter="url(#b40)"/>`;
}

export function productSvg(kind: string, colour: string, variant = 0): string {
  gid = 0;
  let body = '';
  switch (kind) {
    case 'necklaces': {
      // A graduated strand hanging in a soft U: ends high at the clasp, the largest pearls at the centre.
      const a = 1.25;
      const hang = curve((t) => {
        const u = -a + 2 * a * t;
        return [400 + 300 * (Math.sin(u) / Math.sin(a)), 140 + 460 * ((Math.cos(u) - Math.cos(a)) / (1 - Math.cos(a)))];
      });
      body += strand(hang, (f) => 17 + 10 * Math.sin(Math.PI * f), colour);
      body += `<path d="M${hang[0]![0]} ${hang[0]![1] - 18} q${(hang[hang.length - 1]![0] - hang[0]![0]) / 2} -70 ${hang[hang.length - 1]![0] - hang[0]![0]} 0" fill="none" stroke="url(#metal)" stroke-width="2.5"/>`;
      body += `<rect x="388" y="${hang[0]![1] - 62}" width="24" height="14" rx="4" fill="url(#metal)"/>`;
      break;
    }
    case 'earrings': {
      for (const x of [290, 510]) {
        body += `<path d="M${x} 150 c0 -46 52 -46 52 0 c0 40 -52 52 -52 96 v32" fill="none" stroke="url(#metal)" stroke-width="6" stroke-linecap="round"/>`;
        body += `<ellipse cx="${x}" cy="292" rx="18" ry="11" fill="url(#metal)"/>`;
        body += shadow(x, 392, 84, 0.18) + pearl(x, 392, 84, colour);
      }
      break;
    }
    case 'rings': {
      // A band seen at an angle: back half, the pearl in its cup, then the front half.
      body += `<ellipse cx="400" cy="560" rx="190" ry="34" fill="#0e1a22" opacity=".22" filter="url(#b14)"/>`;
      body += `<path d="M230 500 A170 64 0 0 1 570 500" fill="none" stroke="url(#metal)" stroke-width="14" opacity=".85"/>`;
      body += `<path d="M352 430 q48 40 96 0 l-10 40 q-38 22 -76 0z" fill="url(#metal)"/>`;
      body += pearl(400, 340, 110, colour);
      body += `<path d="M230 500 A170 64 0 0 0 570 500" fill="none" stroke="url(#metal)" stroke-width="22"/>`;
      body += `<path d="M262 528 A150 40 0 0 0 420 563" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="3"/>`;
      break;
    }
    case 'bracelets': {
      const pts = curve((t) => [400 + 250 * Math.cos(2 * Math.PI * t), 420 + 135 * Math.sin(2 * Math.PI * t)]);
      body += strand(pts, () => 31, colour, 0.2);
      body += `<rect x="625" y="400" width="34" height="42" rx="6" fill="url(#metal)"/>`;
      break;
    }
    case 'pendants': {
      body += `<path d="M120 40 Q400 470 680 40" fill="none" stroke="url(#metal)" stroke-width="3"/>`;
      body += `<path d="M120 40 Q400 470 680 40" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1" transform="translate(0 -2)"/>`;
      body += `<ellipse cx="400" cy="262" rx="13" ry="20" fill="none" stroke="url(#metal)" stroke-width="6"/>`;
      body += `<path d="M380 300 q20 -18 40 0 l-6 22 h-28z" fill="url(#metal)"/>`;
      body += shadow(400, 420, 112, 0.2) + pearl(400, 420, 112, colour);
      break;
    }
    default: {
      // Loose pearls resting on the paper.
      const set: Array<[number, number, number]> = [
        [300, 430, 118],
        [520, 360, 86],
        [500, 560, 70],
        [180, 600, 46],
        [640, 520, 38],
      ];
      body += set.map(([x, y, r]) => shadow(x, y, r)).join('');
      body += [...set].sort((a, b) => a[1] - b[1]).map(([x, y, r]) => pearl(x, y, r, colour)).join('');
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">${defs()}${studio(variant)}${body}${mark(776, 780)}</svg>`;
}

/** A ridge line across the width, built from a few sine waves so every scene has its own skyline. */
function ridge(baseY: number, amp: number, seed: number, fill: string, opacity = 1): string {
  let d = `M0 900 L0 ${baseY}`;
  for (let x = 0; x <= 1600; x += 32) {
    const y = baseY - amp * (0.55 * Math.sin(x / 210 + seed) + 0.3 * Math.sin(x / 97 + seed * 2.1) + 0.15 * Math.sin(x / 41 + seed * 3.7));
    d += ` L${x} ${y.toFixed(1)}`;
  }
  return `<path d="${d} L1600 900 Z" fill="${fill}" opacity="${opacity}"/>`;
}

function hash(s: string): number {
  let h = 7;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 9973;
  return h / 9973;
}

/**
 * Wide scenes (1600×900) for banners, farms and collections.
 * water: Sahyadri ridges at dawn over a lake, a strand in the foreground.
 * farm:  the lake with rows of pearl-farm floats.
 * craft: a strand draped on dark ink velvet, as in a jeweller's studio.
 */
export function sceneSvg(title: string, tone: 'water' | 'farm' | 'craft' | 'gold' = 'water'): string {
  gid = 0;
  const s = hash(title) * 6;
  if (tone === 'gold') {
    // Golden pearls on ink velvet, lit from the right; the left half stays dark for text.
    const v = uid('v');
    const set: Array<[number, number, number]> = [
      [1120, 470, 150],
      [1360, 600, 96],
      [1250, 760, 62],
      [960, 690, 54],
    ];
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" width="1600" height="900">${defs()}
<defs><radialGradient id="${v}" cx="72%" cy="45%" r="75%"><stop offset="0" stop-color="#33404a"/><stop offset=".55" stop-color="#16222b"/><stop offset="1" stop-color="#0a1117"/></radialGradient></defs>
<rect width="1600" height="900" fill="url(#${v})"/>
<ellipse cx="1180" cy="430" rx="460" ry="320" fill="#f8e7b2" opacity=".07" filter="url(#b40)"/>
<path d="M760 900 C 900 640, 1000 560, 1120 620 S 1400 860, 1600 760" fill="none" stroke="url(#metal)" stroke-width="3" opacity=".9"/>
${set.map(([x, y, r]) => shadow(x, y, r, 0.6, '#000')).join('')}${[...set].sort((a, b) => a[1] - b[1]).map(([x, y, r]) => pearl(x, y, r, 'Golden')).join('')}
${mark(1576, 880, true)}</svg>`;
  }
  if (tone === 'craft') {
    const v = uid('v');
    const pts = curve((t) => [-60 + 1720 * t, 560 + 170 * Math.sin(Math.PI * 1.6 * t + s) - 120 * t]);
    let loose = '';
    for (const [x, y, r] of [
      [380, 760, 30],
      [450, 790, 22],
      [1240, 300, 26],
    ] as const)
      loose += shadow(x, y, r, 0.5, '#000') + pearl(x, y, r, 'White');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" width="1600" height="900">${defs()}
<defs><radialGradient id="${v}" cx="62%" cy="38%" r="80%"><stop offset="0" stop-color="#2d3e4b"/><stop offset=".55" stop-color="#15222c"/><stop offset="1" stop-color="#091117"/></radialGradient></defs>
<rect width="1600" height="900" fill="url(#${v})"/>
<ellipse cx="1050" cy="330" rx="520" ry="260" fill="#e9d9d3" opacity=".08" filter="url(#b40)"/>
${strand(pts, () => 30, 'White', 0.55)}${loose}
<circle cx="1508" cy="${(pts[pts.length - 40]![1] - 4).toFixed(0)}" r="13" fill="none" stroke="url(#metal)" stroke-width="6"/>
${mark(1576, 880, true)}</svg>`;
  }

  const sky = uid('sky');
  const lake = uid('lake');
  const sunX = 900 + 380 * Math.sin(s);
  let floats = '';
  if (tone === 'farm') {
    for (let row = 0; row < 6; row++) {
      const y = 640 + row * row * 9 + row * 18;
      const r = 4 + row * 2.2;
      for (let x = 60 + ((row * 37) % 90); x < 1600; x += 70 + row * 26) {
        floats += `<ellipse cx="${x}" cy="${y + 3}" rx="${r * 1.6}" ry="${r * 0.4}" fill="#0d1820" opacity=".35"/><circle cx="${x}" cy="${y}" r="${r}" fill="#1c2a33"/><circle cx="${x - r * 0.35}" cy="${y - r * 0.35}" r="${r * 0.3}" fill="#fff" opacity=".55"/>`;
      }
      floats += `<path d="M0 ${y} L1600 ${y + 6}" stroke="#0d1820" stroke-opacity=".18" stroke-width="1"/>`;
    }
  }
  const fg =
    tone === 'water'
      ? strand(
          curve((t) => [880 + 760 * t, 905 - 300 * Math.sin((Math.PI / 2) * t) + 40 * t * t]),
          (f) => 28 + 14 * f,
          'White',
          0.4,
        )
      : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" width="1600" height="900">${defs()}
<defs>
<linearGradient id="${sky}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dfe4e8"/><stop offset=".45" stop-color="#efe6e2"/><stop offset=".62" stop-color="#f6e4da"/></linearGradient>
<linearGradient id="${lake}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a9b8c1"/><stop offset=".35" stop-color="#5f7684"/><stop offset="1" stop-color="#1b2a35"/></linearGradient>
</defs>
<rect width="1600" height="620" fill="url(#${sky})"/>
<circle cx="${sunX}" cy="420" r="210" fill="#fff4ea" opacity=".9" filter="url(#b40)"/>
<circle cx="${sunX}" cy="430" r="46" fill="#fffaf3" opacity=".95" filter="url(#b6)"/>
${ridge(440, 70, s, '#c6ced6', 0.9)}
<rect x="0" y="420" width="1600" height="90" fill="#fff" opacity=".45" filter="url(#b40)"/>
${ridge(500, 90, s + 1.3, '#93a2ae')}
<rect x="0" y="500" width="1600" height="70" fill="#fff" opacity=".35" filter="url(#b40)"/>
${ridge(560, 70, s + 2.6, '#5b6e7b')}
${ridge(610, 40, s + 4.1, '#33454f')}
<rect y="612" width="1600" height="288" fill="url(#${lake})"/>
<ellipse cx="${sunX}" cy="720" rx="60" ry="200" fill="#fff3e6" opacity=".35" filter="url(#b14)"/>
${Array.from({ length: 14 }, (_, i) => `<path d="M${sunX - 160 + ((i * 53) % 300)} ${640 + i * 17} h${60 + ((i * 29) % 90)}" stroke="#fff" stroke-opacity="${(0.35 - i * 0.02).toFixed(2)}" stroke-width="2" stroke-linecap="round"/>`).join('')}
${floats}${fg}
${mark(1576, 880, true)}</svg>`;
}
