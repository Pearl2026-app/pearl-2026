// One-off import of the client's shared Google Drive folder ("Website Requirements") into the repo.
// Crawls the public folder, downloads every product photo (resized to 1400px WebP) and one short video per
// design (compressed MP4), plus the logo, and writes packages/db/seed/collection/manifest.json for the seed.
// Run by .github/workflows/import-drive.yml (GitHub runners can reach Google Drive; the dev sandbox cannot).
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, statSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import sharp from 'sharp';

const ROOT_PRODUCTS = process.env.DRIVE_PRODUCTS ?? '1kMcxE1WinsauDPL01kQmT-U6Moo9gmrA';
const LOGO_FOLDER = process.env.DRIVE_LOGO ?? '140zLenc97cy3-Em7B79bUZpuwDV4m5jV';
const OUT = join(process.cwd(), 'packages/db/seed/collection');
const UA = { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36' };

async function list(id) {
  const html = await (await fetch(`https://drive.google.com/drive/folders/${id}`, { headers: UA })).text();
  const re = new RegExp(String.raw`\\x22([A-Za-z0-9_-]{25,})\\x22,\\x5b\\x22${id}\\x22\\x5d,\\x22(.*?)\\x22,\\x22(.*?)\\x22`, 'g');
  const items = [];
  let m;
  while ((m = re.exec(html))) items.push({ id: m[1], name: m[2], mime: m[3].replace(/\\\//g, '/') });
  return items;
}

async function walk(id, path, out) {
  for (const it of await list(id)) {
    if (it.mime.includes('folder')) await walk(it.id, [...path, it.name], out);
    else out.push({ ...it, path });
  }
  return out;
}

async function bytes(url) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, { headers: UA, redirect: 'follow' });
    if (r.ok) {
      const b = Buffer.from(await r.arrayBuffer());
      if (b.length > 1000) return b;
    }
    await new Promise((s) => setTimeout(s, 1500 * (i + 1)));
  }
  throw new Error(`download failed: ${url}`);
}

const image = (id) => bytes(`https://drive.google.com/thumbnail?id=${id}&sz=w2000`);
const video = (id) => bytes(`https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`);
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// Logo: the original PNG plus a 512px version for the sites.
const [logo] = (await list(LOGO_FOLDER)).filter((f) => f.mime.startsWith('image/'));
if (logo) {
  const buf = await image(logo.id);
  await sharp(buf).png().toFile(join(OUT, 'logo.png'));
  await sharp(buf).resize({ width: 512, withoutEnlargement: true }).png().toFile(join(OUT, 'logo-512.png'));
  for (const app of ['apps/web/public/brand', 'apps/admin/public/brand']) {
    mkdirSync(app, { recursive: true });
    await sharp(buf).resize({ width: 512, withoutEnlargement: true }).png().toFile(join(app, 'logo.png'));
  }
  console.log('logo:', logo.name);
}

const files = await walk(ROOT_PRODUCTS, [], []);
console.log(`found ${files.length} files`);

// Group: <Category>[/<Gender>]/<DESIGN>/<variant>/<file>
const designs = new Map();
for (const f of files) {
  const designIdx = f.path.findIndex((p) => /^SP-/i.test(p));
  if (designIdx < 0) continue;
  const category = f.path[0];
  const gender = designIdx > 1 ? f.path[1] : null;
  const design = f.path[designIdx].toUpperCase();
  const variant = f.path[designIdx + 1] ?? '1';
  const key = `${design}/${variant}`;
  if (!designs.has(key)) designs.set(key, { design, variant, category, gender, images: [], videos: [] });
  const d = designs.get(key);
  if (f.mime.startsWith('image/')) d.images.push(f);
  else if (f.mime.startsWith('video/')) d.videos.push(f);
}

const manifest = [];
const videoDone = new Set();
const order = (a, b) => parseInt(a.name) - parseInt(b.name) || a.name.localeCompare(b.name);
for (const d of [...designs.values()].sort((a, b) => (a.design + a.variant).localeCompare(b.design + b.variant))) {
  const dir = join(OUT, slug(d.design), d.variant);
  mkdirSync(dir, { recursive: true });
  const images = [];
  for (const [i, f] of d.images.sort(order).entries()) {
    const name = `${i + 1}.webp`;
    await sharp(await image(f.id)).resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toFile(join(dir, name));
    images.push(`${slug(d.design)}/${d.variant}/${name}`);
  }
  let videoRel = null;
  // One video per design keeps the repository small; the first variant that has one wins.
  if (d.videos.length && !videoDone.has(d.design)) {
    try {
      const raw = join(dir, 'raw.mp4');
      writeFileSync(raw, await video(d.videos[0].id));
      const outFile = join(dir, 'video.mp4');
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-t', '15', '-an', '-vf', "scale='min(720,iw)':-2", '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30', '-movflags', '+faststart', outFile]);
      rmSync(raw);
      if (existsSync(outFile) && statSync(outFile).size > 0) {
        videoRel = `${slug(d.design)}/${d.variant}/video.mp4`;
        videoDone.add(d.design);
      }
    } catch (e) {
      console.warn('video skipped', d.design, d.variant, String(e).slice(0, 200));
    }
  }
  manifest.push({ design: d.design, variant: d.variant, category: d.category, gender: d.gender, images, video: videoRel });
  console.log(d.design, d.variant, images.length, 'images', videoRel ? '+ video' : '');
}

mkdirSync(dirname(join(OUT, 'manifest.json')), { recursive: true });
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`wrote ${manifest.length} variants`);
