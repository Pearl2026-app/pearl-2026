import { chromium, devices } from '@playwright/test';
const B = 'http://localhost:7860';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errors = [];
const page = async (opts = devices['Pixel 7']) => { const p = await (await b.newContext(opts)).newPage(); p.on('pageerror', (e) => errors.push(e.message)); return p; };
const say = async (p, label) => console.log(label, (await p.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 160));

// 1. Shopper: product → cart → checkout → sandbox payment → tracking
const s = await page();
const list = await (await fetch(`${B}/api/v1/catalogue/products?pageSize=48`)).json();
const piece = list.items.find((x) => x.available && !x.isUnique && !x.priceOnRequest);
await s.goto(`${B}/product/${piece.slug}`);
await s.getByRole('button', { name: 'Add to Cart' }).click();
await s.getByRole('button', { name: 'View cart and check out' }).click();
await s.getByRole('link', { name: 'Check out' }).click();
await s.getByLabel('Full name').fill('Demo Buyer'); await s.getByLabel('Mobile number').fill('9876509999');
await s.getByRole('combobox', { name: /^City/ }).selectOption({ label: 'Pune' });
await s.getByLabel('House, building, street').fill('1 Demo Road'); await s.getByLabel('Town / city').fill('Pune'); await s.getByLabel('PIN code').fill('411004');
await s.getByRole('radio', { name: /Pay online/ }).check(); await s.getByRole('button', { name: /^Pay / }).click();
await s.getByRole('button', { name: 'Simulate successful payment' }).click();
await s.getByRole('heading', { name: 'Thank you for your order' }).waitFor();
await s.getByRole('link', { name: 'Track your order' }).click(); await s.getByText(/Online · Paid/).waitFor();
console.log('SHOP: paid online and tracked OK');

// 2. Admin sign-in
const a = await page({ viewport: { width: 1440, height: 900 } });
await a.goto(`${B}/admin/login`);
await a.getByLabel('Email').fill('admin@sahyadripearls.test'); await a.getByLabel('Password').fill('Sahyadri@2026');
await a.getByRole('button', { name: 'Continue' }).click(); await a.getByLabel('One-time code').fill('123456'); await a.getByRole('button', { name: 'Sign in' }).click();
await a.getByText('Recent orders').waitFor(); await say(a, 'ADMIN:');

// 3. Rider app
const r = await page();
await r.goto(`${B}/apps/delivery`); await r.getByText('Send code').waitFor();
await r.getByRole('textbox').first().fill('9800000005'); await r.getByText('Send code').click();
await r.getByText(/^Sign in$/).waitFor(); await r.getByRole('textbox').first().fill('123456'); await r.getByText(/^Sign in$/).click();
await r.getByText(/Collect cash/).first().waitFor(); await say(r, 'RIDER:');

// 4. Customer app: shop tab and sign-in
const c = await page();
await c.goto(`${B}/apps/customer`); await c.getByText('Pearls with a birthplace').waitFor();
await c.getByText('Account', { exact: true }).last().click(); await c.waitForTimeout(1500); await say(c, 'CUSTOMER ACCOUNT TAB:');
await c.screenshot({ path: '/tmp/claude-0/hf-customer-account.png' });
console.log('PAGE ERRORS:', errors.slice(0, 5));
await b.close();
