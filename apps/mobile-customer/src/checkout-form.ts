import { isValidPincode } from '@sahyadri/shared';

// Checks before sending, so the shopper sees problems at once. The API checks everything again.

export interface CheckoutDraft {
  name: string;
  phone: string;
  email: string;
  line1: string;
  line2: string;
  landmark: string;
  area: string;
  cityName: string;
  state: string;
  pincode: string;
  cityId: string;
  addressId: string | null; // a saved address, or null for a new one
}

export const emptyDraft = (): CheckoutDraft => ({ name: '', phone: '', email: '', line1: '', line2: '', landmark: '', area: '', cityName: '', state: 'Maharashtra', pincode: '', cityId: '', addressId: null });

export const normalisePhone = (p: string) => p.replace(/[\s-]/g, '').replace(/^(\+91|0)/, '');

export function checkDraft(d: CheckoutDraft): Record<string, string> {
  const e: Record<string, string> = {};
  if (d.name.trim().length < 2) e.name = 'Enter your name';
  if (!/^[6-9]\d{9}$/.test(normalisePhone(d.phone))) e.phone = 'Enter a 10-digit mobile number';
  if (d.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email.trim())) e.email = 'Check the email address';
  if (!d.cityId) e.cityId = 'Choose your city';
  if (!d.addressId) {
    if (d.line1.trim().length < 3) e.line1 = 'Enter the house / flat and street';
    if (d.cityName.trim().length < 2) e.cityName = 'Enter the town or city';
    if (!isValidPincode(d.pincode)) e.pincode = 'Enter a 6-digit pincode';
  }
  return e;
}

/** The body for POST /checkout. */
export function checkoutBody(d: CheckoutDraft, opts: { paymentMethod: 'ONLINE' | 'COD'; gift: boolean; giftMessage: string; note: string; saveAddress: boolean }) {
  const phone = normalisePhone(d.phone);
  return {
    contact: { name: d.name.trim(), phone, email: d.email.trim() || null },
    ...(d.addressId
      ? { addressId: d.addressId }
      : { address: { name: d.name.trim(), phone, line1: d.line1.trim(), line2: d.line2.trim() || null, landmark: d.landmark.trim() || null, area: d.area.trim() || null, cityName: d.cityName.trim(), state: d.state.trim() || 'Maharashtra', pincode: d.pincode.trim(), cityId: d.cityId } }),
    cityId: d.cityId,
    paymentMethod: opts.paymentMethod,
    note: opts.note.trim() || null,
    saveAddress: opts.saveAddress && !d.addressId,
    ...(opts.gift ? { giftWrap: true, giftMessage: opts.giftMessage.trim() || null } : {}),
    source: 'app',
  };
}
