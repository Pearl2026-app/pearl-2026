'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { nextStatuses, ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL, REASON_REQUIRED, type OrderStatus, type PaymentStatus } from '@sahyadri/shared';
import { Alert, Button, Card, Input, Select, Spinner, StatusBadge } from '@sahyadri/ui';
import { useRefOptions } from '@/components/fields';
import { PageHeader } from '@/components/shell';
import { useToast } from '@/components/toast';
import { api, errorText } from '@/lib/api';
import { dateTime, inr, toPaise } from '@/lib/format';
import { useCan, useMe } from '@/lib/session';

export default function OrderPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const toast = useToast();
  const can = useCan();
  const { data: me } = useMe();
  const { data: o, isLoading } = useQuery({ queryKey: ['/admin/orders', id], queryFn: () => api<any>(`/admin/orders/${id}`) });
  const partners = useRefOptions(can('DELIVERY_PARTNERS') ? { path: '/admin/delivery-partners', query: { isActive: 'true' } } : undefined);
  const vendors = useRefOptions(can('VENDORS') && (me?.role === 'SUPER_ADMIN' || me?.role === 'STAFF') ? { path: '/admin/vendors' } : undefined);
  const franchises = useRefOptions(can('FRANCHISES') && me?.role !== 'FRANCHISE' ? { path: '/admin/franchises' } : undefined);
  const manufacturers = useRefOptions(can('MANUFACTURERS') ? { path: '/admin/manufacturers' } : undefined);
  const [dp, setDp] = useState('');
  const [refund, setRefund] = useState({ amount: '', reason: '' });
  const refresh = () => qc.invalidateQueries({ queryKey: ['/admin/orders'] });
  const act = useMutation({
    mutationFn: ({ path, json }: { path: string; json?: unknown }) => api(`/admin/orders/${id}${path}`, { method: path === '' ? 'PATCH' : 'POST', json }),
    onSuccess: async () => {
      await refresh();
      toast('Saved');
    },
    onError: (e) => toast(errorText(e), 'danger'),
  });
  if (isLoading || !o || !me) return <Spinner />;
  const addr = o.addressSnapshot as Record<string, string>;
  const next = me.role === 'DELIVERY_PARTNER' ? [] : nextStatuses(me.role, o.status as OrderStatus).filter((s) => s !== 'ASSIGNED' && s !== 'REFUNDED');
  const cityPartners = (partners.data?.items ?? []).filter((p: any) => p.cities?.some((c: any) => c.city.id === o.city.id));
  const isHeadOffice = me.role === 'SUPER_ADMIN' || me.role === 'STAFF';
  const paid = o.payments.filter((p: any) => ['CAPTURED', 'REFUNDED', 'PARTIALLY_REFUNDED'].includes(p.status)).reduce((s: number, p: any) => s + p.amountPaise, 0);
  const refunded = o.refunds.filter((r: any) => r.status !== 'FAILED').reduce((s: number, r: any) => s + r.amountPaise, 0);

  const move = (to: OrderStatus) => {
    let reason: string | null = null;
    if (REASON_REQUIRED.includes(to)) {
      reason = window.prompt(`Reason for marking this order ${ORDER_STATUS_LABEL[to].toLowerCase()}?`);
      if (!reason) return;
    }
    act.mutate({ path: '/status', json: { status: to, reason } });
  };

  return (
    <div className="max-w-6xl">
      <PageHeader
        title={`Order ${o.number}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Link href="/orders" className="text-accent hover:underline">← Orders</Link>
            <StatusBadge status={o.status} label={ORDER_STATUS_LABEL[o.status as OrderStatus]} />
            <StatusBadge status={o.paymentStatus} label={PAYMENT_STATUS_LABEL[o.paymentStatus as PaymentStatus]} />
            <span className="text-muted">{dateTime(o.placedAt)} · {o.source.toLowerCase()}{o.channel ? ` · ${o.channel}` : ''}</span>
          </span>
        }
        actions={
          <>
            {next.map((s) => (
              <Button key={s} size="sm" variant={['CANCELLED', 'FAILED', 'RETURNED'].includes(s) ? 'danger' : o.status === 'ASSIGNED' && s === 'PACKED' ? 'secondary' : 'primary'} onClick={() => move(s)} loading={act.isPending}>
                {s === 'CANCELLED' ? 'Cancel order' : o.status === 'ASSIGNED' && s === 'PACKED' ? 'Unassign (back to packed)' : `Mark ${ORDER_STATUS_LABEL[s].toLowerCase()}`}
              </Button>
            ))}
            <a className="inline-flex min-h-9 items-center rounded-sm border border-line bg-surface px-3 text-sm" href={`/api/v1/admin/orders/${id}/packing-slip.pdf`} target="_blank" rel="noreferrer">{o.giftWrap ? 'Gift packing slip' : 'Packing slip'}</a>
            {o.invoice && <a className="inline-flex min-h-9 items-center rounded-sm border border-line bg-surface px-3 text-sm" href={`/api/v1/admin/orders/${id}/invoice.pdf`} target="_blank" rel="noreferrer">Invoice {o.invoice.number}</a>}
            <a className="inline-flex min-h-9 items-center rounded-sm border border-line bg-surface px-3 text-sm" href={o.trackUrl} target="_blank" rel="noreferrer">Tracking page</a>
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-4">
          <Card>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted uppercase"><tr><th className="py-1">Item</th><th>Qty</th><th className="text-right">Price</th><th className="text-right">GST</th><th className="text-right">Total</th></tr></thead>
              <tbody>
                {o.items.map((i: any) => (
                  <tr key={i.id} className="border-t border-line">
                    <td className="py-2">{i.name}<span className="block text-xs text-muted">{i.sku} · HSN {i.hsnCode ?? '—'}</span></td>
                    <td>{i.quantity}</td>
                    <td className="text-right">{inr(i.unitPricePaise)}{i.discountPaise ? <span className="block text-xs text-success">−{inr(i.discountPaise)}</span> : null}</td>
                    <td className="text-right">{inr(i.gstPaise)} <span className="text-xs text-muted">({i.gstRateBp / 100}%)</span></td>
                    <td className="text-right">{inr(i.lineTotalPaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="mt-3 ml-auto grid max-w-xs grid-cols-2 gap-1 text-sm">
              <dt className="text-muted">Subtotal</dt><dd className="text-right">{inr(o.subtotalPaise)}</dd>
              {o.discountPaise > 0 && (<><dt className="text-muted">Discount {o.couponCode && `(${o.couponCode})`}</dt><dd className="text-right">−{inr(o.discountPaise)}</dd></>)}
              <dt className="text-muted">Delivery</dt><dd className="text-right">{inr(o.deliveryPaise)}</dd>
              <dt className="text-muted">Taxable value</dt><dd className="text-right">{inr(o.taxablePaise)}</dd>
              <dt className="text-muted">GST</dt><dd className="text-right">{inr(o.gstPaise)}</dd>
              <dt className="font-semibold">Total</dt><dd className="text-right font-semibold">{inr(o.totalPaise)}</dd>
            </dl>
          </Card>
          <Card>
            <h2 className="mb-2 font-semibold">Timeline</h2>
            <ol className="flex flex-col gap-2 text-sm">
              {o.events.map((e: any) => (
                <li key={e.id} className="border-l-2 border-line pl-3">
                  <p>{e.toStatus ? <StatusBadge status={e.toStatus} label={ORDER_STATUS_LABEL[e.toStatus as OrderStatus]} /> : <strong>{e.type.replace(/_/g, ' ').toLowerCase()}</strong>} {e.message}</p>
                  <p className="text-xs text-muted">{dateTime(e.createdAt)}{e.actor ? ` · ${e.actor.name}` : ''}</p>
                </li>
              ))}
            </ol>
          </Card>
          {o.payments.length > 0 && (
            <Card>
              <h2 className="mb-2 font-semibold">Payments</h2>
              <ul className="text-sm">
                {o.payments.map((p: any) => (
                  <li key={p.id} className="flex justify-between border-t border-line py-1">
                    <span>{p.method.toLowerCase()} · {p.provider} {p.providerPaymentId && <span className="text-xs text-muted">{p.providerPaymentId}</span>}</span>
                    <span>{inr(p.amountPaise)} <StatusBadge status={p.status} /></span>
                  </li>
                ))}
                {o.refunds.map((r: any) => (
                  <li key={r.id} className="flex justify-between border-t border-line py-1 text-danger">
                    <span>Refund · {r.reason}</span>
                    <span>−{inr(r.amountPaise)} <StatusBadge status={r.status} /></span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {o.delivery && (
            <Card>
              <h2 className="mb-2 font-semibold">Delivery</h2>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-muted">Partner</dt><dd>{o.delivery.deliveryPartner?.name ?? '—'} {o.delivery.deliveryPartner?.phone}</dd>
                <dt className="text-muted">Status</dt><dd><StatusBadge status={o.delivery.status} /></dd>
                {o.delivery.failureReason && (<><dt className="text-muted">Reason</dt><dd>{o.delivery.failureReason}</dd></>)}
                {o.delivery.codCollectedPaise != null && (<><dt className="text-muted">COD collected</dt><dd>{inr(o.delivery.codCollectedPaise)}</dd></>)}
                {o.delivery.proofPhotoUrl && (<><dt className="text-muted">Proof</dt><dd><a href={`/api/v1/admin/deliveries/${o.delivery.id}/proof`} className="text-accent underline" target="_blank" rel="noreferrer">View photo</a>{o.delivery.proofOtpVerifiedAt ? ' · customer code verified' : ''}{o.delivery.proofSignatureUrl && <> · <a href={`/api/v1/admin/deliveries/${o.delivery.id}/proof?kind=signature`} className="text-accent underline" target="_blank" rel="noreferrer">signature</a></>}</dd></>)}
              </dl>
            </Card>
          )}
        </div>
        <div className="flex flex-col gap-4">
          <Card>
            <h2 className="mb-2 font-semibold">Customer</h2>
            <p className="text-sm">{o.contactName}<br />{o.contactPhone}{o.contactEmail && <><br />{o.contactEmail}</>}</p>
            <p className="mt-2 text-sm text-muted">{[addr.line1, addr.line2, addr.landmark, addr.area, `${addr.cityName} ${addr.pincode}`, addr.state].filter(Boolean).join(', ')}</p>
            <p className="mt-1 text-sm">City: {o.city.name}</p>
            {o.customerNote && <p className="mt-2 rounded-sm bg-surface-muted p-2 text-sm">Note: {o.customerNote}</p>}
            {o.giftWrap && (
              <p className="mt-2 rounded-sm border border-gold/60 bg-surface-muted p-2 text-sm">
                <strong>Gift:</strong> pack in the gift box; no prices in the parcel (print the gift packing slip).{o.giftMessage ? <> Card message: “{o.giftMessage}”</> : ' No card message.'}
              </p>
            )}
            {o.enquiry && <p className="mt-2 text-sm">From enquiry <Link className="text-accent underline" href={`/enquiries/${o.enquiry.id}`}>{o.enquiry.reference}</Link></p>}
          </Card>
          {can('ORDERS', 'edit') && me.role !== 'VENDOR' && (
            <Card className="flex flex-col gap-3">
              <h2 className="font-semibold">Delivery partner</h2>
              <Select aria-label="Delivery partner" value={dp || o.delivery?.deliveryPartner?.id || ''} onChange={(e) => setDp(e.target.value)}>
                <option value="">Choose a partner in {o.city.name}</option>
                {cityPartners.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
              <Button size="sm" disabled={!dp} onClick={() => act.mutate({ path: '/assign-delivery', json: { deliveryPartnerId: dp } })}>Assign</Button>
              {o.status !== 'PACKED' && !o.delivery && <p className="text-xs text-muted">The order moves to “Assigned” once it is packed.</p>}
            </Card>
          )}
          {(vendors.data || franchises.data || manufacturers.data) && (
            <Card className="flex flex-col gap-3">
              <h2 className="font-semibold">Assignments</h2>
              {vendors.data && (
                <label className="text-sm">Vendor
                  <Select value={o.vendor?.id ?? ''} onChange={(e) => act.mutate({ path: '', json: { vendorId: e.target.value || null } })}>
                    <option value="">—</option>
                    {vendors.data.items.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </Select>
                </label>
              )}
              {franchises.data && (
                <label className="text-sm">Franchise
                  <Select value={o.franchise?.id ?? ''} onChange={(e) => act.mutate({ path: '', json: { franchiseId: e.target.value || null } })}>
                    <option value="">—</option>
                    {franchises.data.items.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </Select>
                </label>
              )}
              {manufacturers.data && me.role !== 'FRANCHISE' && (
                <label className="text-sm">Manufacturer
                  <Select value={o.manufacturer?.id ?? ''} onChange={(e) => act.mutate({ path: '', json: { manufacturerId: e.target.value || null } })}>
                    <option value="">—</option>
                    {manufacturers.data.items.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </Select>
                </label>
              )}
            </Card>
          )}
          {(['SUPER_ADMIN', 'STAFF', 'CITY_MANAGER'] as string[]).includes(me.role) && !['PAID', 'COD_COLLECTED', 'REFUNDED'].includes(o.paymentStatus) && !['CANCELLED', 'FAILED'].includes(o.status) && (
            <Card className="flex flex-col gap-2">
              <h2 className="font-semibold">Record a payment</h2>
              <p className="text-xs text-muted">For cash collected, bank transfer or UPI to the shop. The full amount {inr(o.totalPaise)} is recorded.</p>
              <div className="flex flex-wrap gap-2">
                {o.paymentMethod === 'COD' && <Button size="sm" variant="secondary" onClick={() => window.confirm(`Record ${inr(o.totalPaise)} cash collected?`) && act.mutate({ path: '/payments', json: { method: 'COD', amountPaise: o.totalPaise } })}>COD collected</Button>}
                <Button size="sm" variant="secondary" onClick={() => { const ref = window.prompt('Bank / UPI reference'); if (ref) act.mutate({ path: '/payments', json: { method: 'BANK_TRANSFER', amountPaise: o.totalPaise, reference: ref } }); }}>Bank transfer</Button>
              </div>
            </Card>
          )}
          {isHeadOffice && can('PAYMENTS', 'edit') && paid - refunded > 0 && (
            <Card>
              <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); const amountPaise = toPaise(refund.amount); if (amountPaise && window.confirm(`Refund ${inr(amountPaise)}?`)) act.mutate({ path: '/refunds', json: { amountPaise, reason: refund.reason } }); }}>
                <h2 className="font-semibold">Refund</h2>
                <p className="text-xs text-muted">Up to {inr(paid - refunded)}. Online payments are refunded through the gateway.</p>
                <Input aria-label="Amount in rupees" placeholder="Amount ₹" value={refund.amount} onChange={(e) => setRefund({ ...refund, amount: e.target.value })} />
                <Input aria-label="Reason" placeholder="Reason" value={refund.reason} onChange={(e) => setRefund({ ...refund, reason: e.target.value })} />
                <Button type="submit" size="sm" variant="danger" disabled={!refund.amount || refund.reason.length < 3}>Refund</Button>
              </form>
            </Card>
          )}
          {o.returnRequests.length > 0 && (
            <Card>
              <h2 className="mb-2 font-semibold">Return / cancellation</h2>
              {o.returnRequests.map((r: any) => <p key={r.id} className="text-sm">{r.type.toLowerCase()} · {r.reason} · <StatusBadge status={r.status} /> <Link href="/returns" className="text-accent underline">Open queue</Link></p>)}
            </Card>
          )}
          {o.status === 'FAILED' && o.paymentStatus === 'PAID' && <Alert tone="warning">Payment arrived after the piece was released. A refund was started automatically.</Alert>}
        </div>
      </div>
    </div>
  );
}
