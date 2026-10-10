import { formatINR, ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL, type OrderStatus, type PaymentStatus } from '@sahyadri/shared';
import type { Tracking } from '@/lib/types-commerce';
import { CheckIcon } from './icons';

const STEPS: OrderStatus[] = ['PLACED', 'CONFIRMED', 'PACKED', 'ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED'];

export function Timeline({ t }: { t: Tracking }) {
  const off = ['CANCELLED', 'FAILED', 'RETURNED', 'REFUNDED'].includes(t.status);
  const reached = new Map(t.timeline.map((e) => [e.status, e.at]));
  const idx = STEPS.indexOf(t.status as OrderStatus);
  return (
    <div>
      {off && <p className="mb-4 inline-block bg-[#F8E1DF] px-3 py-1 text-sm text-[#8C1D17]">{ORDER_STATUS_LABEL[t.status as OrderStatus]}</p>}
      <ol className="flex flex-col gap-0">
        {STEPS.map((s, i) => {
          const done = !off && (i <= idx || reached.has(s));
          return (
            <li key={s} className="flex gap-4">
              <div className="flex flex-col items-center">
                <span className={`flex h-7 w-7 items-center justify-center rounded-full border ${done ? 'border-accent bg-accent text-white' : 'border-line bg-surface text-muted'}`}>{done ? <CheckIcon width={16} height={16} /> : null}</span>
                {i < STEPS.length - 1 && <span className={`h-8 w-px ${done && i < idx ? 'bg-accent' : 'bg-line'}`} />}
              </div>
              <div className="pb-4">
                <p className={done ? 'text-ink' : 'text-muted'}>{ORDER_STATUS_LABEL[s]}</p>
                {reached.get(s) && <p className="text-xs text-muted">{new Date(reached.get(s)!).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function OrderSummary({ t, invoiceHref }: { t: Tracking; invoiceHref?: string }) {
  return (
    <div className="flex flex-col gap-4">
      <ul className="divide-y divide-line border-y border-line">
        {t.items.map((i) => (
          <li key={i.sku} className="flex items-center gap-4 py-3">
            {i.imageUrl && <img src={i.imageUrl} alt="" className="h-14 w-14 object-cover" />}
            <span className="flex-1">{i.quantity} × {i.name}</span>
            <span>{formatINR(i.lineTotalPaise, { compact: true })}</span>
          </li>
        ))}
      </ul>
      <dl className="grid grid-cols-2 gap-1 text-sm">
        <dt className="text-muted">Total</dt><dd className="text-right font-serif text-xl">{formatINR(t.totalPaise)}</dd>
        <dt className="text-muted">Payment</dt><dd className="text-right">{t.paymentMethod === 'COD' ? 'Cash on delivery' : 'Online'} · {PAYMENT_STATUS_LABEL[t.paymentStatus as PaymentStatus]}</dd>
        <dt className="text-muted">Deliver to</dt><dd className="text-right">{t.shipTo.name}, {t.shipTo.cityName} {t.shipTo.pincode}</dd>
      </dl>
      {t.invoiceNumber && invoiceHref && <a href={invoiceHref} className="text-sm text-accent underline">Download GST invoice {t.invoiceNumber}</a>}
    </div>
  );
}
