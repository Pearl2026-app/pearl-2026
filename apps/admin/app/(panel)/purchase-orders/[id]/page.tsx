'use client';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Card, Input, Select, Spinner, Textarea } from '@sahyadri/ui';
import { useRefOptions } from '@/components/fields';
import { PageHeader } from '@/components/shell';
import { useToast } from '@/components/toast';
import { api, errorText } from '@/lib/api';
import { PO_NEXT, PO_STAGES } from '@/lib/custom';
import { date, humanize, inr, toPaise, toRupees } from '@/lib/format';
import { useCan, useMe } from '@/lib/session';

interface ProductPick {
  id: string;
  name: string;
  sku: string;
  sizes?: Array<{ label: string; quantity: number }> | null;
}

/** Search-as-you-type product picker, so nobody types specifications by hand (client doc, 26 Oct). */
function ProductPicker({ value, onChange, disabled }: { value: ProductPick | null; onChange: (p: ProductPick | null) => void; disabled?: boolean }) {
  const [q, setQ] = useState('');
  const { data } = useQuery({
    queryKey: ['/admin/products', 'po-pick', q],
    queryFn: () => api<{ items: ProductPick[] }>(`/admin/products?pageSize=50${q ? `&q=${encodeURIComponent(q)}` : ''}`),
  });
  return (
    <div className="grid gap-2 md:grid-cols-2">
      <label className="text-sm">
        Search the catalogue
        <Input placeholder="Name or SR code…" value={q} disabled={disabled} onChange={(e) => setQ(e.target.value)} />
      </label>
      <label className="text-sm">
        Piece
        <Select
          value={value?.id ?? ''}
          disabled={disabled}
          onChange={(e) => {
            const hit = data?.items.find((p) => p.id === e.target.value) ?? null;
            onChange(hit);
          }}
        >
          <option value="">— write the specification by hand —</option>
          {value && !data?.items.some((p) => p.id === value.id) && (
            <option value={value.id}>
              {value.name} ({value.sku})
            </option>
          )}
          {data?.items.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.sku})
            </option>
          ))}
        </Select>
      </label>
    </div>
  );
}

function PurchaseOrder({ id }: { id: string }) {
  const isNew = id === 'new';
  const sp = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const can = useCan();
  const { data: me } = useMe();
  const makers = useRefOptions({ path: '/admin/manufacturers', query: { isActive: 'true' } });
  const { data: p, isLoading } = useQuery({ queryKey: ['/admin/purchase-orders', id], queryFn: () => api<any>(`/admin/purchase-orders/${id}`), enabled: !isNew });
  const [v, setV] = useState({ manufacturerId: '', specification: '', quantity: '1', cost: '', dueDate: '', notes: '', size: '' });
  const [product, setProduct] = useState<ProductPick | null>(null);
  const [stageNote, setStageNote] = useState('');
  // Arriving from the restock page with ?productId=… pre-picks the piece.
  const wantedProduct = sp.get('productId');
  useQuery({
    queryKey: ['/admin/products', wantedProduct, 'prefill'],
    queryFn: async () => {
      const prod = await api<ProductPick>(`/admin/products/${wantedProduct}`);
      setProduct((cur) => cur ?? prod);
      return prod;
    },
    enabled: isNew && !!wantedProduct,
  });
  useEffect(() => {
    if (!p) return;
    setV({ manufacturerId: p.manufacturerId, specification: p.specification, quantity: String(p.quantity), cost: toRupees(p.agreedCostPaise), dueDate: String(p.dueDate).slice(0, 10), notes: p.notes ?? '', size: p.size ?? '' });
    setProduct(p.product ?? null);
  }, [p]);
  useEffect(() => {
    const qty = sp.get('qty');
    if (isNew && qty) setV((x) => ({ ...x, quantity: qty }));
    const size = sp.get('size');
    if (isNew && size) setV((x) => ({ ...x, size }));
  }, [isNew, sp]);
  const body = () => ({
    manufacturerId: v.manufacturerId,
    productId: product?.id ?? null,
    size: v.size.trim() || null,
    specification: v.specification.trim() || undefined,
    quantity: Number(v.quantity) || 1,
    agreedCostPaise: toPaise(v.cost),
    dueDate: v.dueDate,
    notes: v.notes.trim() || null,
  });
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
    mutationFn: ({ s, dueDate }: { s: string; dueDate?: string }) => api(`/admin/purchase-orders/${id}/status`, { method: 'POST', json: { status: s, ...(dueDate ? { dueDate } : {}) } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['/admin/purchase-orders'] });
      toast('Status updated');
    },
    onError: (e) => toast(errorText(e), 'danger'),
  });
  const stage = useMutation({
    mutationFn: (s: string) => api(`/admin/purchase-orders/${id}/stage`, { method: 'POST', json: { stage: s, ...(stageNote.trim() ? { note: stageNote.trim() } : {}) } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['/admin/purchase-orders'] });
      setStageNote('');
      toast('Work status updated — head office has been told');
    },
    onError: (e) => toast(errorText(e), 'danger'),
  });
  if (!isNew && (isLoading || !p)) return <Spinner />;
  const editable = isNew ? can('PURCHASE_ORDERS', 'create') : can('PURCHASE_ORDERS', 'edit') && p.status === 'DRAFT';
  const canStage = !isNew && can('PURCHASE_ORDERS', 'edit') && ['ACCEPTED', 'IN_PRODUCTION'].includes(p?.status);
  const history: Array<{ stage: string; note?: string; at: string; by: string }> = Array.isArray(p?.stageHistory) ? p.stageHistory : [];
  const doneStages = new Set(history.map((h) => h.stage));
  const f = (k: keyof typeof v) => ({ value: v[k], disabled: !editable, onChange: (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value }) });
  const act = (s: string) => {
    if (s === 'ACCEPTED') {
      const nd = window.prompt('Accept with this deadline — confirm or change it (YYYY-MM-DD):', String(p.dueDate).slice(0, 10));
      if (nd) status.mutate({ s, dueDate: nd });
      return;
    }
    if (window.confirm(`Mark ${p.number} ${humanize(s).toLowerCase()}?${s === 'SENT' && p.manufacturer.email ? ` The PDF is emailed to ${p.manufacturer.email}.` : ''}`)) status.mutate({ s });
  };
  return (
    <div className="max-w-3xl">
      <PageHeader
        title={isNew ? 'New purchase order' : `Purchase order ${p.number}`}
        description={
          <span className="flex flex-wrap gap-2">
            <Link href="/purchase-orders" className="text-accent hover:underline">← Purchase orders</Link>
            {p?.order && <Link className="text-accent underline" href={`/orders/${p.order.id}`}>Order {p.order.number}</Link>}
            {p?.order?.customRequest && <Link className="text-accent underline" href={`/custom-orders/${p.order.customRequest.id}`}>Customized order</Link>}
            {p?.product && <Link className="text-accent underline" href={`/products/${p.product.id}`}>{p.product.sku}</Link>}
            {p && (
              <span className="text-muted">
                {humanize(p.status)} · created {date(p.createdAt)}
                {p.autoGenerated ? ' · raised automatically (low stock)' : ''}
              </span>
            )}
          </span>
        }
        actions={
          !isNew && (
            <>
              <a className="inline-flex min-h-9 items-center rounded-sm border border-line bg-surface px-3 text-sm" href={`/api/v1/admin/purchase-orders/${id}/pdf`} target="_blank" rel="noreferrer">PDF</a>
              {can('PURCHASE_ORDERS', 'edit') && PO_NEXT[p.status]!.map((s) => (
                <Button key={s} size="sm" variant={s === 'CLOSED' ? 'secondary' : 'primary'} loading={status.isPending} onClick={() => act(s)}>
                  {s === 'SENT' ? 'Mark sent' : s === 'ACCEPTED' ? 'Accept with deadline' : s === 'CLOSED' ? 'Close' : `Mark ${humanize(s).toLowerCase()}`}
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
          <div className="md:col-span-2">
            <ProductPicker value={product} onChange={setProduct} disabled={!editable} />
          </div>
          {product && Array.isArray(product.sizes) && product.sizes.length > 0 && (
            <label className="text-sm">Size
              <Select {...f('size')}>
                <option value="">Any / mixed</option>
                {product.sizes.map((s) => <option key={s.label} value={s.label}>Size {s.label} ({s.quantity} in stock)</option>)}
              </Select>
            </label>
          )}
          <label className="text-sm md:col-span-2">
            Specification {product ? '(optional — written from the piece when left empty)' : '*'}
            <Textarea rows={5} required={!product} placeholder={product ? `Written automatically from ${product.name} (${product.sku})` : 'What to make, metal, pearl, finish…'} {...f('specification')} />
          </label>
          <label className="text-sm">Quantity<Input type="number" min={1} {...f('quantity')} /></label>
          <label className="text-sm">Agreed cost (₹) *<Input inputMode="decimal" required {...f('cost')} /></label>
          <label className="text-sm">Due date *<Input type="date" required {...f('dueDate')} /></label>
          <label className="text-sm">Notes<Input {...f('notes')} /></label>
          {editable && <div className="md:col-span-2"><Button type="submit" loading={save.isPending}>{isNew ? 'Create and generate PDF' : 'Save and regenerate PDF'}</Button></div>}
          {!isNew && !editable && <p className="text-xs text-muted md:col-span-2">Only a draft can be changed. Agreed cost {inr(p.agreedCostPaise)}.</p>}
        </form>
      </Card>

      {!isNew && (p.stage || canStage || history.length > 0) && (
        <Card className="mt-4">
          <h2 className="mb-1 font-semibold">Work status</h2>
          <p className="mb-3 text-xs text-muted">
            The manufacturer updates this daily; head office is emailed on every change.
            {me?.role === 'MANUFACTURER' ? ' Tap the stage you are on.' : ''}
          </p>
          <ol className="mb-3 flex flex-wrap gap-1.5">
            {PO_STAGES.map((s) => {
              const current = p.stage === s;
              const done = doneStages.has(s) && !current;
              return (
                <li key={s}>
                  <button
                    type="button"
                    disabled={!canStage || stage.isPending}
                    onClick={() => canStage && window.confirm(`Set the work status to “${s}”? Head office is emailed.`) && stage.mutate(s)}
                    className={`rounded-sm border px-2 py-1 text-xs ${current ? 'border-accent bg-accent text-white' : done ? 'border-line bg-surface-muted text-muted line-through' : 'border-line bg-surface'} ${canStage ? 'hover:border-ink' : 'cursor-default'}`}
                  >
                    {s}
                  </button>
                </li>
              );
            })}
          </ol>
          {canStage && (
            <label className="mb-3 block text-sm">
              Note with the next update (optional)
              <Input placeholder="e.g. casting done for 6 of 8 pieces" value={stageNote} onChange={(e) => setStageNote(e.target.value)} />
            </label>
          )}
          {history.length > 0 ? (
            <ul className="flex flex-col gap-1 text-sm">
              {[...history].reverse().map((h, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-2">
                  <Badge tone={i === 0 ? 'success' : 'neutral'}>{h.stage}</Badge>
                  {h.note && <span>{h.note}</span>}
                  <span className="text-xs text-muted">{date(h.at)} · {h.by}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No updates yet.</p>
          )}
        </Card>
      )}
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
