'use client';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Input, Select, Spinner, Textarea } from '@sahyadri/ui';
import { useRefOptions } from '@/components/fields';
import { PageHeader } from '@/components/shell';
import { useToast } from '@/components/toast';
import { api, errorText } from '@/lib/api';
import { PO_NEXT } from '@/lib/custom';
import { date, humanize, inr, toPaise, toRupees } from '@/lib/format';
import { useCan } from '@/lib/session';

function PurchaseOrder({ id }: { id: string }) {
  const isNew = id === 'new';
  const sp = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const can = useCan();
  const makers = useRefOptions({ path: '/admin/manufacturers', query: { isActive: 'true' } });
  const { data: p, isLoading } = useQuery({ queryKey: ['/admin/purchase-orders', id], queryFn: () => api<any>(`/admin/purchase-orders/${id}`), enabled: !isNew });
  const [v, setV] = useState({ manufacturerId: '', specification: '', quantity: '1', cost: '', dueDate: '', notes: '' });
  useEffect(() => {
    if (p) setV({ manufacturerId: p.manufacturerId, specification: p.specification, quantity: String(p.quantity), cost: toRupees(p.agreedCostPaise), dueDate: String(p.dueDate).slice(0, 10), notes: p.notes ?? '' });
  }, [p]);
  const body = () => ({ manufacturerId: v.manufacturerId, specification: v.specification, quantity: Number(v.quantity) || 1, agreedCostPaise: toPaise(v.cost), dueDate: v.dueDate, notes: v.notes.trim() || null });
  const save = useMutation({
    mutationFn: () =>
      isNew
        ? api<{ id: string }>('/admin/purchase-orders', { method: 'POST', json: { ...body(), customRequestId: sp.get('customRequestId'), orderId: sp.get('orderId') } })
        : api<{ id: string }>(`/admin/purchase-orders/${id}`, { method: 'PATCH', json: body() }),
    onSuccess: async (r) => {
      await qc.invalidateQueries({ queryKey: ['/admin/purchase-orders'] });
      await qc.invalidateQueries({ queryKey: ['/admin/custom-orders'] });
      toast(isNew ? 'Purchase order created' : 'Saved');
      if (isNew) router.replace(`/purchase-orders/${r.id}`);
    },
  });
  const status = useMutation({
    mutationFn: (s: string) => api(`/admin/purchase-orders/${id}/status`, { method: 'POST', json: { status: s } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['/admin/purchase-orders'] });
      toast('Status updated');
    },
    onError: (e) => toast(errorText(e), 'danger'),
  });
  if (!isNew && (isLoading || !p)) return <Spinner />;
  const editable = isNew ? can('PURCHASE_ORDERS', 'create') : can('PURCHASE_ORDERS', 'edit') && p.status === 'DRAFT';
  const f = (k: keyof typeof v) => ({ value: v[k], disabled: !editable, onChange: (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value }) });
  return (
    <div className="max-w-3xl">
      <PageHeader
        title={isNew ? 'New purchase order' : `Purchase order ${p.number}`}
        description={
          <span className="flex flex-wrap gap-2">
            <Link href="/purchase-orders" className="text-accent hover:underline">← Purchase orders</Link>
            {p?.order && <Link className="text-accent underline" href={`/orders/${p.order.id}`}>Order {p.order.number}</Link>}
            {p?.order?.customRequest && <Link className="text-accent underline" href={`/custom-orders/${p.order.customRequest.id}`}>Customized order</Link>}
            {p && <span className="text-muted">{humanize(p.status)} · created {date(p.createdAt)}</span>}
          </span>
        }
        actions={
          !isNew && (
            <>
              <a className="inline-flex min-h-9 items-center rounded-sm border border-line bg-surface px-3 text-sm" href={`/api/v1/admin/purchase-orders/${id}/pdf`} target="_blank" rel="noreferrer">PDF</a>
              {can('PURCHASE_ORDERS', 'edit') && PO_NEXT[p.status]!.map((s) => (
                <Button key={s} size="sm" variant={s === 'CLOSED' ? 'secondary' : 'primary'} loading={status.isPending} onClick={() => window.confirm(`Mark ${p.number} ${humanize(s).toLowerCase()}?${s === 'SENT' && p.manufacturer.email ? ` The PDF is emailed to ${p.manufacturer.email}.` : ''}`) && status.mutate(s)}>
                  {s === 'SENT' ? 'Mark sent' : s === 'CLOSED' ? 'Close' : `Mark ${humanize(s).toLowerCase()}`}
                </Button>
              ))}
            </>
          )
        }
      />
      {isNew && sp.get('customRequestId') && <div className="mb-3"><Alert tone="info">This PO is linked to the customized order and moves it to “PO raised”.</Alert></div>}
      <Card>
        <form className="grid gap-3 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          {save.error && <div className="md:col-span-2"><Alert tone="danger">{errorText(save.error)}</Alert></div>}
          <label className="text-sm md:col-span-2">Manufacturer *
            <Select required {...f('manufacturerId')}>
              <option value="">Choose a manufacturer</option>
              {makers.data?.items.map((m) => <option key={String(m.id)} value={String(m.id)}>{String(m.name)}{m.speciality ? ` · ${String(m.speciality)}` : ''}</option>)}
            </Select>
          </label>
          <label className="text-sm md:col-span-2">Specification *<Textarea rows={5} required {...f('specification')} /></label>
          <label className="text-sm">Quantity<Input type="number" min={1} {...f('quantity')} /></label>
          <label className="text-sm">Agreed cost (₹) *<Input inputMode="decimal" required {...f('cost')} /></label>
          <label className="text-sm">Due date *<Input type="date" required {...f('dueDate')} /></label>
          <label className="text-sm">Notes<Input {...f('notes')} /></label>
          {editable && <div className="md:col-span-2"><Button type="submit" loading={save.isPending}>{isNew ? 'Create and generate PDF' : 'Save and regenerate PDF'}</Button></div>}
          {!isNew && !editable && <p className="text-xs text-muted md:col-span-2">Only a draft can be changed. Agreed cost {inr(p.agreedCostPaise)}.</p>}
        </form>
      </Card>
    </div>
  );
}

export default function PurchaseOrderPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <Suspense>
      <PurchaseOrder id={id} />
    </Suspense>
  );
}
