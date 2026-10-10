import { writeFileSync } from 'node:fs';
import { buildOpenApi, createApp } from './bootstrap';

/** Writes docs/api/openapi.json (used as the API reference). */
async function main() {
  const app = await createApp({ logger: false });
  await app.init();
  const out = process.argv[2] ?? 'openapi.json';
  writeFileSync(out, JSON.stringify(buildOpenApi(app), null, 2));
  await app.close();
  console.log(`Wrote ${out}`);
  process.exit(0);
}

void main();
