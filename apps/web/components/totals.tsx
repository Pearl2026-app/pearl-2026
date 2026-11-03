import { formatINR } from '@sahyadri/shared';
import type { Totals } from '@/lib/types-commerce';

export function TotalsTable({ t, couponCode, walletPaise = 0 }: { t: Totals; couponCode?: string | null; walletPaise?: number }) {
  const discount = t.discountPaise - walletPaise;
  const row = (label: string, v: string, cls = '') => (
    <div className={`flex justify-between gap-4 py-1 ${cls}`}>
      <dt>{label}</dt>
      <dd>{v}</dd>
    </div>
  );
  return (
    <dl className="text-sm">
      {row('Subtotal', formatINR(t.subtotalPaise))}
      {discount > 0 && row(`Discount${couponCode ? ` (${couponCode})` : ''}`, `−${formatINR(discount)}`, 'text-success')}
      {walletPaise > 0 && row('Paid from wallet', `−${formatINR(walletPaise)}`, 'text-success')}
      {row('Delivery', t.deliveryPaise ? formatINR(t.deliveryPaise) : 'Free')}
      {row('GST included', formatINR(t.gstPaise), 'text-muted')}
      <div className="mt-2 flex justify-between gap-4 border-t border-line pt-3 font-serif text-2xl">
        <dt>Total</dt>
        <dd>{formatINR(t.totalPaise)}</dd>
      </div>
    </dl>
  );
}
