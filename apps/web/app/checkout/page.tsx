'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { rememberOrder } from '@/components/order-strip';
import { formatINR } from '@sahyadri/shared';
import { FormField, Notice, SelectInput, TextInput } from '@/components/form-bits';
import { useSession } from '@/components/session';
import { useSite } from '@/components/site-context';
import { TotalsTable } from '@/components/totals';
import { Container } from '@/components/ui';
import { api, ApiError, errorText } from '@/lib/api';
import { attribution } from '@/lib/enquiry';
import type { CartView } from '@/lib/types-commerce';

interface Address { id: string; label: string | null; name: string; phone: string; line1: string; line2: string | null; landmark: string | null; area: string | null; cityName: string; state: string; pincode: string; cityId: string | null; isDefault: boolean }

declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => { open: () => void; on: (e: string, cb: (r: unknown) => void) => void };
  }
}

const loadRazorpay = () =>
  new Promise<void>((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load the payment window.'));
    document.body.appendChild(s);
  });

const EMPTY = { name: '', phone: '', line1: '', line2: '', landmark: '', area: '', cityName: '', state: 'Maharashtra', pincode: '' };

export default function CheckoutPage() {
  const site = useSite();
  const router = useRouter();
  const { me, loaded, setCartCount } = useSession();
  const [cart, setCart] = useState<CartView | null>(null);
  const [contact, setContact] = useState({ name: '', phone: '', email: '' });
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressId, setAddressId] = useState<string>('new');
  const [addr, setAddr] = useState(EMPTY);
  const [cityId, setCityId] = useState('');
  const [method, setMethod] = useState<'ONLINE' | 'COD'>('ONLINE');
  const [note, setNote] = useState('');
  const [gift, setGift] = useState(false);
  const [giftMessage, setGiftMessage] = useState('');
  const [business, setBusiness] = useState(false);
  const [usePoints, setUsePoints] = useState(false);
  const [gstin, setGstin] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [saveAddress, setSaveAddress] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Keeps the number on the cart so an unfinished checkout can get one reminder (timing set in the admin). */
  const rememberContact = () => {
    const phone = contact.phone.replace(/[\s-]/g, '');
    if (!/^(\+91|0)?[6-9]\d{9}$/.test(phone)) return;
    void api('/checkout/quote', { method: 'POST', json: { phone, name: contact.name.trim() || undefined, ...(cityId ? { cityId } : {}) } }).catch(() => undefined);
  };

  const quote = useCallback(async (city: string) => {
    try {
      const q = await api<CartView>('/checkout/quote', { method: 'POST', json: city ? { cityId: city } : {} });
      setCart(q);
      if (q.paymentMethods && !q.paymentMethods.online && q.paymentMethods.cod) setMethod('COD');
      if (q.paymentMethods && q.paymentMethods.online && !q.paymentMethods.cod) setMethod('ONLINE');
    } catch (e) {
      setError(errorText(e));
    }
  }, []);

  useEffect(() => {
    const slug = document.cookie.match(/(?:^|; )sp_city=([^;]+)/)?.[1];
    const c = site.cities.find((x) => x.slug === slug);
    if (c) setCityId(c.id);
    void quote(c?.id ?? '');
  }, [quote, site.cities]);

  useEffect(() => {
    if (!loaded || !me) return;
    setContact({ name: me.name === 'Customer' ? '' : me.name, phone: me.phone?.replace('+91', '') ?? '', email: me.email ?? '' });
    if (me.customer?.preferredPaymentMethod === 'COD') setMethod('COD');
    api<Address[]>('/me/addresses')
      .then((list) => {
        setAddresses(list);
        const d = list.find((a) => a.isDefault) ?? list[0];
        if (d) {
          setAddressId(d.id);
          if (d.cityId) {
            setCityId(d.cityId);
            void quote(d.cityId);
          }
        }
      })
      .catch(() => undefined);
  }, [loaded, me, quote]);

  const chooseCity = (id: string) => {
    setCityId(id);
    const c = site.cities.find((x) => x.id === id);
    if (c && addressId === 'new') setAddr((a) => ({ ...a, cityName: a.cityName || c.name, state: c.state }));
    void quote(id);
  };

  const place = async () => {
    setBusy(true);
    setErrors({});
    setError(null);
    try {
      const body = {
        contact: { name: contact.name, phone: contact.phone, email: contact.email || null },
        ...(addressId !== 'new' ? { addressId } : { address: { ...addr, name: addr.name || contact.name, phone: addr.phone || contact.phone, cityId } }),
        cityId,
        paymentMethod: method,
        note: note || null,
        ...(usePoints ? { usePoints: true } : {}),
        ...(business && gstin.trim() ? { gstin: gstin.trim().toUpperCase(), businessName: businessName.trim() || null } : {}),
        ...(gift ? { giftWrap: true, giftMessage: giftMessage.trim() || null } : {}),
        saveAddress: !!me && addressId === 'new' && saveAddress,
        ...attribution(),
      };
      const r = await api<{ order: { number: string; token: string; totalPaise: number }; payment: Record<string, any> | null }>('/checkout', { method: 'POST', json: body });
      setCartCount(0);
      const done = `/order/${encodeURIComponent(r.order.number)}/confirmed?t=${r.order.token}`;
      rememberOrder(r.order.number, r.order.token);
      if (!r.payment) return router.push(done);
      if (r.payment.mode === 'sandbox') return router.push(`/pay/sandbox?po=${r.payment.orderId}&n=${encodeURIComponent(r.order.number)}&t=${r.order.token}&a=${r.order.totalPaise}`);
      await loadRazorpay();
      const rzp = new window.Razorpay!({
        key: r.payment.key,
        order_id: r.payment.orderId,
        amount: r.payment.amount,
        currency: 'INR',
        name: 'Sahyadri Pearls',
        description: `Order ${r.order.number}`,
        prefill: r.payment.prefill,
        theme: { color: '#111111' },
        handler: async (resp: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          await api('/payments/verify', { method: 'POST', json: { orderId: resp.razorpay_order_id, paymentId: resp.razorpay_payment_id, signature: resp.razorpay_signature } }).catch(() => undefined);
          router.push(done);
        },
        modal: { ondismiss: () => router.push(done) },
      });
      rzp.open();
    } catch (e) {
      if (e instanceof ApiError && e.fields) {
        const f: Record<string, string> = {};
        for (const [k, v] of Object.entries(e.fields)) f[k.replace(/^(address|contact)\./, '')] = v;
        setErrors(f);
      }
      setError(errorText(e));
      if (e instanceof ApiError && e.code === 'CART_ISSUES') void quote(cityId);
    } finally {
      setBusy(false);
    }
  };

  if (!cart) return <Container className="py-16"><p className="text-muted">{error ?? 'Loading checkout…'}</p></Container>;
  if (!cart.items.length)
    return (
      <Container className="py-16">
        <p className="text-lg text-muted">Your cart is empty.</p>
        <Link href="/jewellery" className="mt-6 inline-flex min-h-12 items-center bg-accent px-6 text-white">Explore jewellery</Link>
      </Container>
    );
  const pm = cart.paymentMethods ?? { online: true, cod: true, codMaxPaise: 0 };
  const hasUnique = cart.items.some((i) => i.product.isUnique);
  const set = <K extends keyof typeof addr>(k: K) => (e: { target: { value: string } }) => setAddr((a) => ({ ...a, [k]: e.target.value }));

  return (
    <Container className="pb-32 lg:pb-12">
      <div className="flex items-center justify-between py-6">
        <h1 className="font-serif text-4xl">Checkout</h1>
        <span className="text-sm text-muted">🔒 Secure</span>
      </div>
      {!me && (
        <p className="mb-6 text-sm text-muted">
          Checking out as a guest. <Link href="/login?next=/checkout" className="text-accent underline">Sign in</Link> to use saved addresses.
        </p>
      )}
      <form className="grid gap-10 lg:grid-cols-[1.4fr_1fr]" onSubmit={(e) => (e.preventDefault(), void place())} noValidate>
        <div className="flex flex-col gap-10">
          {error && <Notice tone="danger">{error}</Notice>}
          <section aria-labelledby="h-contact" className="flex flex-col gap-4">
            <h2 id="h-contact" className="eyebrow">1 · Contact</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Full name" error={errors.name} required>{(id, d) => <TextInput id={id} aria-describedby={d} autoComplete="name" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} invalid={!!errors.name} />}</FormField>
              <FormField label="Mobile number" error={errors.phone} hint="For delivery updates on WhatsApp" required>{(id, d) => <TextInput id={id} aria-describedby={d} type="tel" inputMode="tel" autoComplete="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} onBlur={rememberContact} invalid={!!errors.phone} />}</FormField>
              <FormField label="Email" error={errors.email} hint="For your invoice">{(id, d) => <TextInput id={id} aria-describedby={d} type="email" autoComplete="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />}</FormField>
            </div>
          </section>

          <section aria-labelledby="h-address" className="flex flex-col gap-4">
            <h2 id="h-address" className="eyebrow">2 · Delivery address</h2>
            {addresses.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Saved addresses">
                {addresses.map((a) => (
                  <label key={a.id} className={`flex min-h-11 cursor-pointer gap-3 border p-4 text-sm ${addressId === a.id ? 'border-accent bg-accent-soft' : 'border-line bg-surface'}`}>
                    <input type="radio" name="address" checked={addressId === a.id} onChange={() => { setAddressId(a.id); if (a.cityId) chooseCity(a.cityId); }} />
                    <span>
                      <strong>{a.label ?? a.name}</strong>
                      <br />
                      {a.line1}, {a.cityName} {a.pincode}
                    </span>
                  </label>
                ))}
                <label className={`flex min-h-11 cursor-pointer items-center gap-3 border p-4 text-sm ${addressId === 'new' ? 'border-accent bg-accent-soft' : 'border-line bg-surface'}`}>
                  <input type="radio" name="address" checked={addressId === 'new'} onChange={() => setAddressId('new')} /> A new address
                </label>
              </div>
            )}
            <FormField label="City" error={errors.cityId} required>
              {(id, d) => (
                <SelectInput id={id} aria-describedby={d} value={cityId} onChange={(e) => chooseCity(e.target.value)} invalid={!!errors.cityId}>
                  <option value="">Choose your city</option>
                  {site.cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </SelectInput>
              )}
            </FormField>
            {addressId === 'new' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2"><FormField label="House, building, street" error={errors.line1} required>{(id, d) => <TextInput id={id} aria-describedby={d} autoComplete="address-line1" value={addr.line1} onChange={set('line1')} invalid={!!errors.line1} />}</FormField></div>
                <FormField label="Area / locality" error={errors.area}>{(id) => <TextInput id={id} autoComplete="address-level3" value={addr.area} onChange={set('area')} />}</FormField>
                <FormField label="Landmark" error={errors.landmark}>{(id) => <TextInput id={id} value={addr.landmark} onChange={set('landmark')} />}</FormField>
                <FormField label="Town / city" error={errors.cityName} required>{(id, d) => <TextInput id={id} aria-describedby={d} autoComplete="address-level2" value={addr.cityName} onChange={set('cityName')} invalid={!!errors.cityName} />}</FormField>
                <FormField label="PIN code" error={errors.pincode} required>{(id, d) => <TextInput id={id} aria-describedby={d} inputMode="numeric" autoComplete="postal-code" maxLength={6} value={addr.pincode} onChange={set('pincode')} invalid={!!errors.pincode} />}</FormField>
                <FormField label="State" error={errors.state} required>{(id, d) => <TextInput id={id} aria-describedby={d} autoComplete="address-level1" value={addr.state} onChange={set('state')} invalid={!!errors.state} />}</FormField>
                {me && (
                  <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2">
                    <input type="checkbox" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} /> Save this address
                  </label>
                )}
              </div>
            )}
            <FormField label="Delivery note (optional)">{(id) => <TextInput id={id} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Gate code, best time to deliver…" />}</FormField>
            {me && (me.customer?.pointsPaise ?? 0) > 0 && (
              <label className={`flex min-h-11 cursor-pointer items-center gap-3 border p-4 text-sm ${usePoints ? 'border-accent bg-accent-soft' : 'border-line bg-surface'}`}>
                <input type="checkbox" checked={usePoints} onChange={(e) => setUsePoints(e.target.checked)} className="h-5 w-5" />
                <span>
                  <strong>Use my credit points</strong> · you have ₹{Math.floor((me.customer!.pointsPaise ?? 0) / 100).toLocaleString('en-IN')} in points
                  {site.loyalty ? `; points can pay up to ${site.loyalty.maxRedeemPercent}% of the order` : ''}. The exact amount shows on your order.
                </span>
              </label>
            )}
            <div className={`border p-4 ${business ? 'border-accent bg-accent-soft' : 'border-line bg-surface'}`}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                <input type="checkbox" checked={business} onChange={(e) => setBusiness(e.target.checked)} className="h-5 w-5" />
                <span><strong>Buying for a business?</strong> · add your GST number for a GST invoice</span>
              </label>
              {business && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField label="GSTIN" error={errors.gstin}>
                    {(id, d) => <TextInput id={id} aria-describedby={d} value={gstin} maxLength={15} onChange={(e) => setGstin(e.target.value.toUpperCase())} placeholder="27ABCDE1234F1Z5" autoCapitalize="characters" />}
                  </FormField>
                  <FormField label="Registered business name">
                    {(id) => <TextInput id={id} value={businessName} maxLength={160} onChange={(e) => setBusinessName(e.target.value)} />}
                  </FormField>
                </div>
              )}
            </div>
            {site.storefront.giftWrapEnabled && (
              <div className={`border p-4 ${gift ? 'border-accent bg-accent-soft' : 'border-line bg-surface'}`}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                  <input type="checkbox" checked={gift} onChange={(e) => setGift(e.target.checked)} className="h-5 w-5" />
                  <span><strong>This is a gift</strong> · free gift box and message card; no prices in the parcel</span>
                </label>
                {gift && (
                  <FormField label="Message for the card (optional)" hint={`${giftMessage.length}/200`}>
                    {(id, d) => <TextInput id={id} aria-describedby={d} value={giftMessage} maxLength={200} onChange={(e) => setGiftMessage(e.target.value)} placeholder="Happy anniversary, with love" />}
                  </FormField>
                )}
              </div>
            )}
          </section>

          <section aria-labelledby="h-pay" className="flex flex-col gap-3">
            <h2 id="h-pay" className="eyebrow">3 · Payment</h2>
            <div role="radiogroup" aria-label="Payment method" className="flex flex-col gap-3">
              <label className={`flex min-h-14 cursor-pointer items-center gap-3 border p-4 ${!pm.online ? 'opacity-50' : method === 'ONLINE' ? 'border-accent bg-accent-soft' : 'border-line bg-surface'}`}>
                <input type="radio" name="pay" disabled={!pm.online} checked={method === 'ONLINE'} onChange={() => setMethod('ONLINE')} />
                <span>
                  <strong>Pay online</strong>
                  <span className="block text-sm text-muted">UPI, cards, net banking, wallets{!pm.online ? ' · not available right now' : ''}</span>
                </span>
              </label>
              <label className={`flex min-h-14 cursor-pointer items-center gap-3 border p-4 ${!pm.cod ? 'opacity-50' : method === 'COD' ? 'border-accent bg-accent-soft' : 'border-line bg-surface'}`}>
                <input type="radio" name="pay" disabled={!pm.cod} checked={method === 'COD'} onChange={() => setMethod('COD')} />
                <span>
                  <strong>Cash on delivery</strong>
                  <span className="block text-sm text-muted">{pm.cod ? 'Pay when your order arrives' : `Available for orders up to ${formatINR(pm.codMaxPaise, { compact: true })}`}</span>
                </span>
              </label>
              {errors.paymentMethod && <p role="alert" className="text-sm text-danger">{errors.paymentMethod}</p>}
            </div>
          </section>
        </div>

        <aside className="h-fit bg-surface p-6 lg:sticky lg:top-28">
          <h2 className="mb-4 font-serif text-2xl">Order summary</h2>
          <ul className="mb-4 flex flex-col gap-2 text-sm">
            {cart.items.map((i) => (
              <li key={i.productId} className="flex justify-between gap-3">
                <span>{i.quantity} × {i.product.name}</span>
                <span>{i.product.pricePaise != null ? formatINR(i.product.pricePaise * i.quantity, { compact: true }) : ''}</span>
              </li>
            ))}
          </ul>
          {cart.issues.length > 0 && <Notice tone="danger">{cart.issues.join('. ')}</Notice>}
          {cart.totals && <TotalsTable t={cart.totals} couponCode={cart.coupon?.code ?? cart.couponCode} />}
          {hasUnique && method === 'ONLINE' && <p className="mt-3 text-xs text-muted">One-of-a-kind pieces are held for you for 15 minutes while you pay.</p>}
          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur lg:static lg:mt-6 lg:border-0 lg:bg-transparent lg:p-0">
            <button type="submit" disabled={busy || !cart.totals || cart.issues.length > 0} className="flex min-h-12 w-full items-center justify-center bg-accent text-[15px] text-white hover:bg-accent-hover disabled:opacity-60">
              {busy ? 'Placing order…' : `${method === 'COD' ? 'Place order' : 'Pay'} ${cart.totals ? formatINR(cart.totals.totalPaise, { compact: true }) : ''}`}
            </button>
          </div>
          <p className="mt-3 text-xs text-muted">
            By placing this order you agree to our <Link href="/terms" className="underline">Terms</Link> and <Link href="/return-cancellation-policy" className="underline">Return policy</Link>.
          </p>
        </aside>
      </form>
    </Container>
  );
}
