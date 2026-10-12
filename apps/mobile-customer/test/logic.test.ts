import { describe, expect, it } from 'vitest';
import { checkDraft, checkoutBody, emptyDraft } from '../src/checkout-form';
import { activeCount, toggle, toQuery } from '../src/filters';
import { routeFor } from '../src/links';

describe('links into the app', () => {
  const host = 'www.sahyadripearls.in';
  it('maps website links to screens', () => {
    expect(routeFor('https://www.sahyadripearls.in/product/moonlit-pendant', host)).toBe('/product/moonlit-pendant');
    expect(routeFor('https://sahyadripearls.in/track/SP-2610-00001?t=abc.def', host)).toBe('/order/SP-2610-00001?t=abc.def');
    expect(routeFor('https://www.sahyadripearls.in/order/SP-2610-00001/confirmed?t=x', host)).toBe('/order/SP-2610-00001?t=x');
    expect(routeFor('https://www.sahyadripearls.in/jewellery/rings', host)).toBe('/shop?category=rings');
    expect(routeFor('https://www.sahyadripearls.in/collections/bridal', host)).toBe('/shop?collection=bridal');
    expect(routeFor('https://www.sahyadripearls.in/', host)).toBe('/');
  });
  it('maps notification paths and the payment return link', () => {
    expect(routeFor('/offers')).toBe('/shop');
    expect(routeFor('/product/teardrop-pendant')).toBe('/product/teardrop-pendant');
    expect(routeFor('sahyadri://order/SP-2610-00009?t=tok&status=paid')).toBe('/order/SP-2610-00009?t=tok');
  });
  it('leaves other sites and unknown pages to the browser', () => {
    expect(routeFor('https://evil.example/product/x', host)).toBeNull();
    expect(routeFor('https://www.sahyadripearls.in/careers', host)).toBeNull();
    expect(routeFor('not a url at all %%%', host)).toBeNull();
  });
});

describe('shop filters', () => {
  it('builds the API query in paise', () => {
    expect(toQuery({ band: '10-25', colour: ['White', 'Golden'], sort: 'price_asc', category: 'rings' }, 2, 'pune')).toEqual({
      page: 2, pageSize: 20, category: 'rings', colour: 'White,Golden', priceMin: 1_000_000, priceMax: 2_500_000, sort: 'price_asc', city: 'pune',
    });
    expect(toQuery({ band: 'u10', q: '  studs ' })).toMatchObject({ q: 'studs', priceMax: 1_000_000 });
    expect(toQuery({ band: 'u10' })).not.toHaveProperty('priceMin');
  });
  it('counts filters and toggles values', () => {
    expect(activeCount({ q: 'x', sort: 'price_asc' })).toBe(0);
    expect(activeCount({ colour: ['White', 'Black'], band: 'o50', inStock: true })).toBe(4);
    expect(toggle(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggle(['a', 'b'], 'a')).toEqual(['b']);
  });
});

describe('checkout form', () => {
  const filled = { ...emptyDraft(), name: 'Asha Patil', phone: '+91 98000 00007', line1: '12 Prabhat Road', cityName: 'Pune', pincode: '411004', cityId: 'c1' };
  it('accepts a complete new address and builds the request', () => {
    expect(checkDraft(filled)).toEqual({});
    const body = checkoutBody(filled, { paymentMethod: 'COD', gift: true, giftMessage: ' With love ', note: '', saveAddress: true });
    expect(body.contact.phone).toBe('9800000007');
    expect(body).toMatchObject({ address: { cityId: 'c1', pincode: '411004' }, giftWrap: true, giftMessage: 'With love', saveAddress: true, note: null });
  });
  it('flags missing fields', () => {
    const e = checkDraft({ ...emptyDraft(), phone: '12345', pincode: '011004' });
    expect(Object.keys(e).sort()).toEqual(['cityId', 'cityName', 'line1', 'name', 'phone', 'pincode']);
  });
  it('needs no address fields when a saved address is chosen', () => {
    const d = { ...emptyDraft(), name: 'Asha', phone: '9800000007', cityId: 'c1', addressId: 'a1' };
    expect(checkDraft(d)).toEqual({});
    const body = checkoutBody(d, { paymentMethod: 'ONLINE', gift: false, giftMessage: '', note: 'Call first', saveAddress: true });
    expect(body).toMatchObject({ addressId: 'a1', saveAddress: false, note: 'Call first' });
    expect(body).not.toHaveProperty('giftWrap');
  });
});
