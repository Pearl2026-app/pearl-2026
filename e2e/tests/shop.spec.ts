import { expect, test } from '@playwright/test';
import { pickPiece } from './helpers';

// Browse → cart → pay online → track, as a guest on a phone.
test('a shopper finds a piece, pays online and tracks the order', async ({ page, request }) => {
  const piece = await pickPiece(request, { unique: false });

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  await page.goto(`/product/${piece.slug}`);
  await expect(page.getByRole('heading', { level: 1, name: piece.name })).toBeVisible();
  await page.getByRole('button', { name: 'Add to Cart' }).click();
  await expect(page.getByRole('button', { name: 'Added to cart' })).toBeVisible();
  await page.getByRole('button', { name: 'View cart and check out' }).click();

  await expect(page).toHaveURL(/\/cart$/);
  await expect(page.getByText(piece.name).first()).toBeVisible();
  await page.getByRole('link', { name: 'Check out' }).click();

  await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible();
  await page.getByLabel('Full name').fill('Meera Joshi');
  await page.getByLabel('Mobile number').fill('9876500011');
  await page.getByRole('combobox', { name: /^City/ }).selectOption({ label: 'Pune' });
  await page.getByLabel('House, building, street').fill('4 Law College Road');
  await page.getByLabel('Town / city').fill('Pune');
  await page.getByLabel('PIN code').fill('411004');
  await page.getByRole('radio', { name: /Pay online/ }).check();
  await page.getByRole('button', { name: /^Pay / }).click();

  await expect(page).toHaveURL(/\/pay\/sandbox/);
  await page.getByRole('button', { name: 'Simulate successful payment' }).click();

  await expect(page.getByRole('heading', { name: 'Thank you for your order' })).toBeVisible();
  await page.getByRole('link', { name: 'Track your order' }).click();
  await expect(page).toHaveURL(/\/track\//);
  await expect(page.getByText(/Online · Paid/)).toBeVisible();
});
