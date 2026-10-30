import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const ADMIN = 'http://localhost:3001/admin';
export const CODE = '123456'; // DEV_FIXED_OTP in e2e/env.mjs
export const PASSWORD = 'Sahyadri@2026';

interface Piece { id: string; slug: string; name: string; sku: string; isUnique: boolean; available: boolean; priceOnRequest: boolean; pricePaise: number }

/** A piece that is in stock and sold at a listed price, skipping any already used by an earlier test in this run. */
export async function pickPiece(request: APIRequestContext, opts: { unique?: boolean; skip?: string[] } = {}): Promise<Piece> {
  // The real stock list fills the first pages with one-of-a-kind rings, so look through every page.
  for (let page = 1; page <= 40; page++) {
    const r = await request.get(`http://localhost:4000/api/v1/catalogue/products?pageSize=60&page=${page}`);
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    const items = body.items as Piece[];
    const p = items.find((x) => x.available && !x.priceOnRequest && (opts.unique === undefined || x.isUnique === opts.unique) && !opts.skip?.includes(x.slug));
    if (p) return p;
    if (page * 60 >= body.total) break;
  }
  throw new Error('No suitable piece in the seeded catalogue');
}

/** Head office sign-in: email and password, then the one-time code. */
export async function staffLogin(page: Page, email = 'admin@sahyadripearls.test') {
  await page.goto(`${ADMIN}/login`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('One-time code').fill(CODE);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** Partner sign-in (vendor, franchise or delivery): mobile number, then the one-time code. */
export async function partnerLogin(page: Page, identifier: string) {
  await page.goto(`${ADMIN}/login`);
  await page.getByRole('tab', { name: 'Vendor / Franchise / Delivery' }).click();
  await page.getByLabel('Email or mobile number').fill(identifier);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('One-time code').fill(CODE);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login/);
}
