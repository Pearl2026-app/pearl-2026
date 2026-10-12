#!/usr/bin/env node
// Turns docs/api/openapi.json into docs/api/API-REFERENCE.md: every route, grouped by area, with who may call it.
// Regenerate both with `pnpm api:docs` (needs the API built and its .env).
import { readFileSync, writeFileSync } from 'node:fs';

const spec = JSON.parse(readFileSync('docs/api/openapi.json', 'utf8'));
const groups = new Map();
for (const [path, item] of Object.entries(spec.paths)) {
  for (const [method, op] of Object.entries(item)) {
    const tag = op.tags?.[0] ?? 'other';
    if (!groups.has(tag)) groups.set(tag, []);
    const body = op.requestBody ? 'yes' : '';
    groups.get(tag).push({ method: method.toUpperCase(), path: path.replace(/^\/api\/v1/, ''), access: op['x-access'] ?? '', body });
  }
}
const order = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
let md = `# API reference

Generated from the running code by \`pnpm api:docs\`; do not edit by hand. The machine-readable version is [openapi.json](openapi.json) (OpenAPI 3), which tools such as Postman or Insomnia can import. In development the same reference is browsable at \`/api/docs\`; it is switched off in production.

- Base path: \`/api/v1\`. Money is in integer paise (₹1 = 100 paise).
- **Access:** \`public\` needs no sign-in. \`signed in\` needs a session: cookies for the website and admin, or \`Authorization: Bearer <token>\` for the apps. \`roles …\` limits a route to those roles. \`permission MODULE.action\` is checked against docs/PERMISSION-MATRIX.md. Partners are further limited to their own city, vendor or franchise records.
- Browser requests that change data with cookies must send the header \`X-SP-Client: web\` (or \`admin\`).
- Errors come back as \`{ code, message, fields? }\`.

${spec.info.description ?? ''}

| Area | Routes |
|---|---|
${[...groups.entries()].map(([t, r]) => `| [${t}](#${t.toLowerCase().replace(/[^a-z0-9 -]/g, '').replace(/ /g, '-')}) | ${r.length} |`).join('\n')}
`;
for (const [tag, routes] of groups) {
  routes.sort((a, b) => a.path.localeCompare(b.path) || order.indexOf(a.method) - order.indexOf(b.method));
  md += `\n## ${tag}\n\n| Method | Path | Access | Body |\n|---|---|---|---|\n`;
  for (const r of routes) md += `| ${r.method} | \`${r.path}\` | ${r.access} | ${r.body} |\n`;
}
writeFileSync('docs/api/API-REFERENCE.md', md);
console.log(`Wrote docs/api/API-REFERENCE.md (${[...groups.values()].reduce((n, r) => n + r.length, 0)} routes)`);
