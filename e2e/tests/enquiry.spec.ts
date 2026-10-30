import { expect, test } from '@playwright/test';
import { ADMIN, CODE, partnerLogin, pickPiece, staffLogin } from './helpers';

// Browse → enquire on WhatsApp → head office converts the enquiry → delivery partner delivers it.
test('an enquiry becomes an order that is delivered with proof', async ({ page, request, browser }) => {
  const piece = await pickPiece(request, { unique: true });
  const buyer = `Rohan Kulkarni ${Date.now().toString(36)}`;

  // 1. The shopper enquires. The enquiry is saved before WhatsApp opens; WhatsApp itself is stubbed.
  let whatsappUrl = '';
  await page.route(/https:\/\/(wa\.me|api\.whatsapp\.com)\//, (route) => {
    whatsappUrl = route.request().url();
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<p>WhatsApp</p>' });
  });
  await page.goto(`/product/${piece.slug}`);
  // On phones the fixed Add to cart / Buy now bar and the live gallery move around the inline button,
  // so fire the click on the button itself rather than at a screen position.
  const enquire = page.getByRole('button', { name: /^Enquire/ }).first();
  await expect(enquire).toBeEnabled();
  await enquire.dispatchEvent('click');
  await expect.poll(() => whatsappUrl).toContain('wa.me');
  const reference = decodeURIComponent(whatsappUrl).match(/ENQ-[A-Z0-9-]+/)?.[0];
  expect(reference, 'the WhatsApp message carries the enquiry reference').toBeTruthy();
  expect(reference).not.toMatch(/^ENQ-W-/); // saved on the server, not the offline fallback

  // 2. Head office converts it into a cash-on-delivery order and assigns the Pune rider.
  const office = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const admin = await office.newPage();
  await staffLogin(admin);
  await admin.goto(`${ADMIN}/enquiries?q=${encodeURIComponent(reference!)}`);
  await admin.getByRole('link', { name: reference! }).click();
  await admin.getByRole('button', { name: 'Convert to order' }).click();
  const dialog = admin.getByRole('dialog');
  await dialog.getByLabel('Customer name').fill(buyer);
  await dialog.getByLabel('Customer mobile').fill('9876500022');
  await dialog.getByLabel('City', { exact: true }).selectOption({ label: 'Pune' });
  await dialog.getByLabel('Pincode').fill('411038');
  await dialog.getByLabel('Address line 1').fill('7 Karve Road');
  await dialog.getByLabel('State').fill('Maharashtra');
  await dialog.getByLabel('Payment method').selectOption('COD');
  await dialog.getByRole('button', { name: 'Create order' }).click();
  await expect(admin).toHaveURL(/\/admin\/orders\/[a-z0-9]+$/);
  const orderUrl = admin.url();
  const orderNumber = (await admin.getByRole('heading', { level: 1 }).textContent())!.replace('Order ', '').trim();

  await admin.getByRole('button', { name: 'Mark confirmed' }).click();
  await admin.getByRole('button', { name: 'Mark packed' }).click();
  await admin.getByRole('radio', { name: 'Vikram Pawar' }).check();
  await admin.getByRole('button', { name: 'Assign delivery partner' }).click();
  await expect(admin.getByText('Delivery partner: ')).toBeVisible();

  // 3. The rider picks it up and delivers it with a photo, the customer's code and the cash.
  const phone = await browser.newContext({ ...test.info().project.use });
  const rider = await phone.newPage();
  await partnerLogin(rider, '+919800000005');
  await rider.goto(`${ADMIN}/delivery`);
  await rider.getByRole('link', { name: new RegExp(orderNumber) }).click();
  await rider.getByRole('button', { name: 'Picked up from the store' }).click();
  await rider.getByRole('button', { name: 'Start delivery' }).click();
  await rider.getByLabel('Photo of the handover (required)').setInputFiles({
    name: 'handover.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'),
  });
  await rider.getByLabel(/Customer’s delivery code/).fill(CODE);
  await rider.getByLabel(/I have collected/).check();
  await rider.getByRole('button', { name: 'Mark delivered' }).click();
  await expect(rider.getByText(/^Delivered · cash/)).toBeVisible();

  // 4. Head office sees it delivered.
  await admin.goto(orderUrl);
  await expect(admin.getByRole('heading', { level: 1 })).toHaveText(`Order ${orderNumber}`);
  await expect(admin.getByText('Delivered', { exact: true }).first()).toBeVisible();
  await expect(admin.getByText('COD Collected', { exact: true }).first()).toBeVisible();
  await office.close();
  await phone.close();
});
