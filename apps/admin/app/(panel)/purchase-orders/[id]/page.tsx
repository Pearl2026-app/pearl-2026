'use client';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Card, Input, Select, Spinner, Textarea } from '@sahyadri/ui';
import { useRefOptions } from '@/components/fields';
import { PageHeader } from '@/components/shell';
import { useToast } from '@/components/toast';
import { api, errorText } from '@/lib/api';
import { normalisePoStage, PO_HEAD_OFFICE_STAGES, PO_NEXT, PO_STAGES, PO_WORK_STAGES, poCost } from '@/lib/custom';
import { date, dateTime, humanize, inr, toPaise, toRupees } from '@/lib/format';
import { useCan, useMe } from '@/lib/session';

interface ProductPick {
  id: string;
  name: string;
  sku: string;
  sizes?: Array<{ label: string; quantity: number }> | null;
}
interface Prefill extends ProductPick {
  pearlSizeMm: number | null;
  pearlWeightCt: number | null;
  metal: string | null;
  metalWeightG: number | null;
  makingRatePerGramPaise: number | null;
  gstPercent: number;
  images: Array<{ stored: string; url: string | null }>;
}
interface Cost {
  subtotalPaise: number;
  gstPaise: number;
  totalPaise: number;
}

const METALS = ['92.5 Silver', '18K Gold', '22K Gold', '14K Gold', '9K Gold', 'Platinum'];
const EMPTY = { manufacturerId: '', specification: '', quantity: '1', cost: '', dueDate: '', notes: '', size: '', pearlSizeMm: '', pearlWeightCt: '', metal: '', metalWeightG: '', rate: '', gstPercent: '5' };
type Form = typeof EMPTY;
const str = (v: unknown) => (v == null ? '' : String(Number(v)));
const numOrNull = (s: string) => (s.trim() === '' || !Number.isFinite(Number(s)) ? null : Number(s));

/** Search-as-you-type product picker, so nobody types specifications by hand (client doc, 26 Oct). */
function ProductPicker({ value, onChange, disabled }: { value: ProductPick | null; onChange: (p: ProductPick | null) => void; disabled?: boolean }) {
  const [q, setQ] = useState('');
  const { data } = useQuery({
    queryKey: ['/admin/products', 'po-pick', q],
    queryFn: () => api<{ items: ProductPick[] }>(`/admin/products?pageSize=50${q ? `&q=${encodeURIComponent(q)}` : ''}`),
    enabled: !disabled,
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
          <option value="">— not from the catalogue —</option>
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

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-line py-1.5 text-sm last:border-0">
      <span className="text-muted">{k}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}

function CostRows({ cost, rate, gstPercent, weight, qty }: { cost: Cost | null; rate: number | null; gstPercent: string | number; weight: string | number | null; qty: number }) {
  if (!cost) return <p className="text-sm text-muted">Enter the metal weight and the making rate per gram to work out the cost.</p>;
  return (
    <div>
      <Row k={`Making: ${Number(weight)} g × ${inr(rate, false)}/g × ${qty}`}>{inr(cost.subtotalPaise, false)}</Row>
      <Row k={`GST ${Number(gstPercent)}%`}>{inr(cost.gstPaise, false)}</Row>
      <Row k="Total">{inr(cost.totalPaise, false)}</Row>
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
  const isMaker = me?.role === 'MANUFACTURER';
  const isHeadOffice = me?.role === 'SUPER_ADMIN' || me?.role === 'STAFF';
  const makers = useRefOptions(isHeadOffice ? { path: '/admin/manufacturers', query: { isActive: 'true' } } : undefined);
  const { data: p, isLoading } = useQuery({ queryKey: ['/admin/purchase-orders', id], queryFn: () => api<any>(`/admin/purchase-orders/${id}`), enabled: !isNew });
  const [v, setV] = useState<Form>(EMPTY);
  const [costTouched, setCostTouched] = useState(false);
  const [product, setProduct] = useState<ProductPick | null>(null);
  const [prefillImages, setPrefillImages] = useState<Prefill['images']>([]);
  const [pendingImages, setPendingImages] = useState<File[]>([]);
  const [pendingCad, setPendingCad] = useState<File | null>(null);
  const [stageNote, setStageNote] = useState('');
  const [billAmount, setBillAmount] = useState('');
  const [billFile, setBillFile] = useState<File | null>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const cadRef = useRef<HTMLInputElement>(null);
  const billRef = useRef<HTMLInputElement>(null);

  /** A picked piece fills in its numbers, photos and the design's last making rate; every field stays editable. */
  const applyPrefill = async (prod: ProductPick | null) => {
    setProduct(prod);
    if (!prod) {
      setPrefillImages([]);
      return;
    }
    try {
      const f = await api<Prefill>(`/admin/purchase-orders/prefill?productId=${prod.id}`);
      setProduct({ id: f.id, name: f.name, sku: f.sku, sizes: f.sizes });
      setPrefillImages(f.images);
      setV((x) => ({
        ...x,
        pearlSizeMm: str(f.pearlSizeMm) || x.pearlSizeMm,
        pearlWeightCt: str(f.pearlWeightCt) || x.pearlWeightCt,
        metal: f.metal ?? x.metal,
        metalWeightG: str(f.metalWeightG) || x.metalWeightG,
        rate: f.makingRatePerGramPaise ? toRupees(f.makingRatePerGramPaise) : x.rate,
        gstPercent: String(f.gstPercent ?? x.gstPercent),
      }));
    } catch (e) {
      toast(errorText(e), 'danger');
    }
  };

  // Arriving from the restock page with ?productId=… pre-picks the piece.
  const wantedProduct = sp.get('productId');
  useEffect(() => {
    if (isNew && wantedProduct && isHeadOffice) void applyPrefill({ id: wantedProduct, name: '', sku: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, wantedProduct, isHeadOffice]);
  useEffect(() => {
    if (!p) return;
    setV({
      manufacturerId: p.manufacturerId,
      specification: p.specification ?? '',
      quantity: String(p.quantity),
      cost: toRupees(p.agreedCostPaise),
      dueDate: String(p.dueDate).slice(0, 10),
      notes: p.notes ?? '',
      size: p.ringSize ?? p.size ?? '',
      pearlSizeMm: str(p.pearlSizeMm),
      pearlWeightCt: str(p.pearlWeightCt),
      metal: p.metal ?? '',
      metalWeightG: str(p.metalWeightG),
      rate: toRupees(p.makingRatePerGramPaise),
      gstPercent: str(p.gstPercent) || '5',
    });
    // The agreed cost follows the computed total unless it was set to something else.
    setCostTouched(!!p.cost && p.cost.totalPaise !== p.agreedCostPaise);
    setProduct(p.product ?? null);
  }, [p]);
  useEffect(() => {
    const qty = sp.get('qty');
    if (isNew && qty) setV((x) => ({ ...x, quantity: qty }));
    const size = sp.get('size');
    if (isNew && size) setV((x) => ({ ...x, size }));
  }, [isNew, sp]);

  const qty = Math.max(1, Number(v.quantity) || 1);
  const computed = poCost({ metalWeightG: numOrNull(v.metalWeightG), makingRatePerGramPaise: toPaise(v.rate || 'x'), quantity: qty, gstPercent: numOrNull(v.gstPercent) ?? 5 });
  const agreedPaise = costTouched ? toPaise(v.cost || 'x') : (computed?.totalPaise ?? toPaise(v.cost || 'x'));

  const body = () => ({
    manufacturerId: v.manufacturerId,
    productId: product?.id ?? null,
    size: v.size.trim() || null,
    ringSize: v.size.trim() || null,
    specification: v.specification.trim(),
    quantity: qty,
    pearlSizeMm: numOrNull(v.pearlSizeMm),
    pearlWeightCt: numOrNull(v.pearlWeightCt),
    metal: v.metal.trim() || null,
    metalWeightG: numOrNull(v.metalWeightG),
    makingRatePerGramPaise: v.rate.trim() ? toPaise(v.rate) : null,
    gstPercent: numOrNull(v.gstPercent) ?? 5,
    ...(agreedPaise ? { agreedCostPaise: agreedPaise } : {}),
    dueDate: v.dueDate,
    notes: v.notes.trim() || null,
  });
  const upload = async (poId: string, kind: 'image' | 'cad' | 'bill', files: File[], extra: Record<string, string> = {}) => {
    const fd = new FormData();
    fd.append('kind', kind);
    for (const [k, val] of Object.entries(extra)) fd.append(k, val);
    for (const f of files) fd.append('files', f);
    return api(`/admin/purchase-orders/${poId}/files`, { method: 'POST', body: fd });
  };
  const refresh = () => qc.invalidateQueries({ queryKey: ['/admin/purchase-orders'] });

  const save = useMutation({
    mutationFn: async () => {
      const r = isNew
        ? await api<{ id: string }>('/admin/purchase-orders', { method: 'POST', json: { ...body(), customRequestId: sp.get('customRequestId'), orderId: sp.get('orderId') } })
        : await api<{ id: string }>(`/admin/purchase-orders/${id}`, { method: 'PATCH', json: body() });
      // Photos and the CAD file picked before the PO existed go up right after it is created.
      if (isNew && pendingImages.length) await upload(r.id, 'image', pendingImages);
      if (isNew && pendingCad) await upload(r.id, 'cad', [pendingCad]);
      return r;
    },
    onSuccess: async (r) => {
      await refresh();
      await qc.invalidateQueries({ queryKey: ['/admin/custom-orders'] });
      toast(isNew ? 'Purchase order created' : 'Saved');
      setPendingImages([]);
      setPendingCad(null);
      if (isNew) router.replace(`/purchase-orders/${r.id}`);
    },
  });
  const files = useMutation({
    mutationFn: ({ kind, list, extra }: { kind: 'image' | 'cad' | 'bill'; list: File[]; extra?: Record<string, string> }) => upload(id, kind, list, extra),
    onSuccess: async (_r, vars) => {
      await refresh();
      if (vars.kind === 'bill') {
        setBillAmount('');
        setBillFile(null);
      }
      toast(vars.kind === 'bill' ? 'Bill uploaded — head office has been told' : 'Uploaded');
    },
    onError: (e) => toast(errorText(e), 'danger'),
  });
  const removeFile = useMutation({
    mutationFn: (x: { kind: 'image' | 'cad'; url?: string }) => api(`/admin/purchase-orders/${id}/files/remove`, { method: 'POST', json: x }),
    onSuccess: async () => {
      await refresh();
      toast('Removed');
    },
    onError: (e) => toast(errorText(e), 'danger'),
  });
  const status = useMutation({
    mutationFn: ({ s, dueDate }: { s: string; dueDate?: string }) => api(`/admin/purchase-orders/${id}/status`, { method: 'POST', json: { status: s, ...(dueDate ? { dueDate } : {}) } }),
    onSuccess: async () => {
      await refresh();
      toast('Status updated');
    },
    onError: (e) => toast(errorText(e), 'danger'),
  });
  const pearls = useMutation({
    mutationFn: (step: 'SENT' | 'RECEIVED') => api(`/admin/purchase-orders/${id}/pearls`, { method: 'POST', json: { step } }),
    onSuccess: async (_r, step) => {
      await refresh();
      toast(step === 'SENT' ? 'Pearls marked sent — the manufacturer has been told' : 'Pearls received — you can now accept with a deadline');
    },
    onError: (e) => toast(errorText(e), 'danger'),
  });
  const stage = useMutation({
    mutationFn: (s: string) => api(`/admin/purchase-orders/${id}/stage`, { method: 'POST', json: { stage: s, ...(stageNote.trim() ? { note: stageNote.trim() } : {}) } }),
    onSuccess: async () => {
      await refresh();
      setStageNote('');
      toast('Work status updated — head office has been told');
    },
    onError: (e) => toast(errorText(e), 'danger'),
  });

  if (!isNew && (isLoading || !p)) return <Spinner />;
  const canEdit = can('PURCHASE_ORDERS', 'edit');
  const editable = isHeadOffice && (isNew ? can('PURCHASE_ORDERS', 'create') : canEdit && p.status === 'DRAFT');
  const open = !isNew && p.status !== 'CLOSED';
  const manageFiles = isHeadOffice && canEdit && (isNew ? editable : open);
  const history: Array<{ stage: string; note?: string; at: string; by: string }> = Array.isArray(p?.stageHistory) ? p.stageHistory : [];
  const current = normalisePoStage(p?.stage);
  const reached = new Set(history.map((h) => normalisePoStage(h.stage)));
  const stageAllowed = (s: string) => {
    if (isNew || !canEdit || !(PO_WORK_STAGES as readonly string[]).includes(s)) return false;
    if ((PO_HEAD_OFFICE_STAGES as readonly string[]).includes(s)) return isHeadOffice && ['ACCEPTED', 'IN_PRODUCTION', 'RECEIVED'].includes(p.status);
    return ['ACCEPTED', 'IN_PRODUCTION'].includes(p.status);
  };
  const canStage = !isNew && PO_STAGES.some(stageAllowed);
  const f = (k: keyof Form) => ({ value: v[k], disabled: !editable, onChange: (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value }) });
  const nextSteps: string[] = isNew ? [] : (PO_NEXT[p.status] ?? []).filter((s) => (isHeadOffice ? true : isMaker && ['ACCEPTED', 'IN_PRODUCTION'].includes(s)));
  const act = (s: string) => {
    if (s === 'ACCEPTED') {
      const nd = window.prompt('Accept with this deadline — confirm or change it (YYYY-MM-DD):', String(p.dueDate).slice(0, 10))?.trim();
      if (!nd) return;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(nd) || Number.isNaN(new Date(nd).getTime())) return toast('Write the deadline as year-month-day, e.g. 2026-12-31.', 'danger');
      status.mutate({ s, dueDate: nd });
      return;
    }
    if (window.confirm(`Mark ${p.number} ${humanize(s).toLowerCase()}?${s === 'SENT' && p.manufacturer.email ? ` The PDF is emailed to ${p.manufacturer.email}.` : ''}`)) status.mutate({ s });
  };
  const sizes = product && Array.isArray(product.sizes) && product.sizes.length > 0 ? product.sizes : null;
  const photos: Array<{ stored: string; url: string | null }> = isNew ? prefillImages : (p.images ?? []);

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={isNew ? 'New purchase order' : `Purchase order ${p.number}`}
        description={
          <span className="flex flex-wrap gap-2">
            <Link href="/purchase-orders" className="text-accent hover:underline">← Purchase orders</Link>
            {p?.order && !isMaker && <Link className="text-accent underline" href={`/orders/${p.order.id}`}>Order {p.order.number}</Link>}
            {p?.order?.customRequest && !isMaker && <Link className="text-accent underline" href={`/custom-orders/${p.order.customRequest.id}`}>Customized order</Link>}
            {p?.product && <span className="text-muted">{p.product.name} ({p.product.sku})</span>}
            {p && (
              <span className="text-muted">
                {humanize(p.status)} · created {date(p.createdAt)} · due {date(p.dueDate)}
                {p.autoGenerated ? ' · raised automatically (low stock)' : ''}
              </span>
            )}
          </span>
        }
        actions={
          !isNew && (
            <>
              <a className="inline-flex min-h-9 items-center rounded-sm border border-line bg-surface px-3 text-sm" href={`/api/v1/admin/purchase-orders/${id}/pdf`} target="_blank" rel="noreferrer">PDF</a>
              {canEdit &&
                nextSteps.map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant={s === 'CLOSED' ? 'secondary' : 'primary'}
                    loading={status.isPending}
                    disabled={s === 'ACCEPTED' && !p.pearlsReceivedAt}
                    title={s === 'ACCEPTED' && !p.pearlsReceivedAt ? 'Confirm “Pearls received” first' : undefined}
                    onClick={() => act(s)}
                  >
                    {s === 'SENT' ? 'Mark sent' : s === 'ACCEPTED' ? 'Accept with deadline' : s === 'IN_PRODUCTION' ? 'Start work' : s === 'CLOSED' ? 'Close' : `Mark ${humanize(s).toLowerCase()}`}
                  </Button>
                ))}
            </>
          )
        }
      />
      {isNew && sp.get('customRequestId') && <div className="mb-3"><Alert tone="info">This PO is linked to the customized order and moves it to “PO raised”. The customer’s reference photos go with it.</Alert></div>}

      {!isNew && p.status !== 'DRAFT' && p.status !== 'CLOSED' && (
        <Card className="mb-4">
          <h2 className="mb-1 font-semibold">Pearls</h2>
          <p className="mb-3 text-xs text-muted">Head office sends the pearls first. The manufacturer confirms they arrived, then accepts the PO with a deadline.</p>
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div className="flex items-center gap-2">
              <Badge tone={p.pearlsSentAt ? 'success' : 'waiting'}>{p.pearlsSentAt ? 'Sent' : 'Not sent'}</Badge>
              <span className="text-muted">{p.pearlsSentAt ? dateTime(p.pearlsSentAt) : 'Head office marks this'}</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={p.pearlsReceivedAt ? 'success' : 'waiting'}>{p.pearlsReceivedAt ? 'Received' : 'Not received'}</Badge>
              <span className="text-muted">{p.pearlsReceivedAt ? dateTime(p.pearlsReceivedAt) : 'The manufacturer confirms this'}</span>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {canEdit && isHeadOffice && !p.pearlsSentAt && p.status === 'SENT' && (
              <Button size="sm" loading={pearls.isPending} onClick={() => window.confirm('Mark the pearls sent to the manufacturer?') && pearls.mutate('SENT')}>Mark pearls sent</Button>
            )}
            {canEdit && p.pearlsSentAt && !p.pearlsReceivedAt && p.status === 'SENT' && (
              <Button size="sm" loading={pearls.isPending} onClick={() => window.confirm('Confirm the pearls have arrived? Head office is emailed.') && pearls.mutate('RECEIVED')}>Pearls received</Button>
            )}
            {p.status === 'SENT' && !p.pearlsReceivedAt && <span className="self-center text-xs text-muted">“Accept with deadline” unlocks once the pearls are received.</span>}
          </div>
        </Card>
      )}

      <Card>
        <form className="grid gap-3 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          {save.error && <div className="md:col-span-2"><Alert tone="danger">{errorText(save.error)}</Alert></div>}
          {isHeadOffice ? (
            <label className="text-sm md:col-span-2">Manufacturer *
              <Select required {...f('manufacturerId')}>
                <option value="">Choose a manufacturer</option>
                {makers.data?.items.map((m) => <option key={String(m.id)} value={String(m.id)}>{String(m.name)}{m.speciality ? ` · ${String(m.speciality)}` : ''}</option>)}
                {p && !makers.data?.items.some((m) => String(m.id) === p.manufacturerId) && <option value={p.manufacturerId}>{p.manufacturer.name}</option>}
              </Select>
            </label>
          ) : (
            p && <p className="text-sm md:col-span-2"><span className="text-muted">Manufacturer:</span> {p.manufacturer.name}</p>
          )}
          {editable && (
            <div className="md:col-span-2">
              <ProductPicker value={product} onChange={(x) => void applyPrefill(x)} disabled={!editable} />
            </div>
          )}

          <h3 className="mt-2 text-sm font-semibold md:col-span-2">Specification of this piece</h3>
          <label className="text-sm">Pearl size (mm)<Input type="number" inputMode="decimal" step="0.001" min={0} placeholder="e.g. 7.125" {...f('pearlSizeMm')} /></label>
          <label className="text-sm">Pearl weight (ct)<Input type="number" inputMode="decimal" step="0.001" min={0} placeholder="e.g. 1.250" {...f('pearlWeightCt')} /></label>
          <label className="text-sm">Metal
            <Input list="po-metals" placeholder="e.g. 92.5 Silver" {...f('metal')} />
            <datalist id="po-metals">{METALS.map((m) => <option key={m} value={m} />)}</datalist>
          </label>
          <label className="text-sm">Metal weight (g)<Input type="number" inputMode="decimal" step="0.001" min={0} placeholder="e.g. 4.250" {...f('metalWeightG')} /></label>
          {sizes ? (
            <label className="text-sm">Ring size
              <Select {...f('size')}>
                <option value="">Any / mixed</option>
                {sizes.map((s) => <option key={s.label} value={s.label}>Size {s.label} ({s.quantity} in stock)</option>)}
              </Select>
            </label>
          ) : (
            <label className="text-sm">Ring size (optional)<Input placeholder="e.g. 12" {...f('size')} /></label>
          )}
          <label className="text-sm">Quantity<Input type="number" min={1} {...f('quantity')} /></label>
          <label className="text-sm md:col-span-2">
            Other notes / specification
            <Textarea rows={3} placeholder="Finish, setting style, anything the numbers above don’t cover…" {...f('specification')} />
          </label>

          <h3 className="mt-2 text-sm font-semibold md:col-span-2">Making charge</h3>
          <label className="text-sm">Making rate (₹ per gram)<Input inputMode="decimal" placeholder="e.g. 120" {...f('rate')} /></label>
          <label className="text-sm">GST (%)<Input type="number" inputMode="decimal" step="0.01" min={0} max={28} {...f('gstPercent')} /></label>
          <div className="rounded-sm bg-surface-muted px-3 py-2 md:col-span-2">
            <CostRows cost={computed} rate={toPaise(v.rate || 'x')} gstPercent={v.gstPercent || 5} weight={v.metalWeightG} qty={qty} />
          </div>
          <label className="text-sm">
            Agreed cost (₹) {computed && !costTouched ? '— the computed total' : ''}
            <Input
              inputMode="decimal"
              required={!computed}
              value={costTouched ? v.cost : computed ? toRupees(computed.totalPaise) : v.cost}
              disabled={!editable}
              onChange={(e) => {
                setCostTouched(true);
                setV({ ...v, cost: e.target.value });
              }}
            />
            {editable && costTouched && computed && (
              <button type="button" className="mt-1 text-xs text-accent underline" onClick={() => setCostTouched(false)}>Use the computed total ({inr(computed.totalPaise, false)})</button>
            )}
          </label>
          <label className="text-sm">Due date *<Input type="date" required {...f('dueDate')} /></label>
          <label className="text-sm md:col-span-2">Notes<Input {...f('notes')} /></label>

          {isNew && editable && (
            <div className="md:col-span-2">
              <h3 className="text-sm font-semibold">Photos and CAD file</h3>
              <p className="mb-2 text-xs text-muted">The manufacturer doesn’t know SR codes: send the design photos and the CAD file with the PO. They upload once the PO is created.</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="secondary" onClick={() => imageRef.current?.click()}>Add photos{pendingImages.length ? ` (${pendingImages.length})` : ''}</Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => cadRef.current?.click()}>{pendingCad ? `CAD: ${pendingCad.name}` : 'Add CAD file'}</Button>
              </div>
            </div>
          )}
          {editable && <div className="md:col-span-2"><Button type="submit" loading={save.isPending}>{isNew ? 'Create and generate PDF' : 'Save and regenerate PDF'}</Button></div>}
          {!isNew && !editable && isHeadOffice && <p className="text-xs text-muted md:col-span-2">Only a draft can be changed.</p>}
        </form>
      </Card>

      <input ref={imageRef} type="file" accept="image/*" multiple hidden onChange={(e) => {
        const list = Array.from(e.target.files ?? []);
        e.target.value = '';
        if (!list.length) return;
        if (isNew) setPendingImages((x) => [...x, ...list]);
        else files.mutate({ kind: 'image', list });
      }} />
      <input ref={cadRef} type="file" hidden onChange={(e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        if (isNew) setPendingCad(file);
        else files.mutate({ kind: 'cad', list: [file] });
      }} />

      {(!isNew || photos.length > 0 || pendingImages.length > 0) && (
        <Card className="mt-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Design photos & CAD</h2>
            {manageFiles && !isNew && (
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" loading={files.isPending} onClick={() => imageRef.current?.click()}>Add photos</Button>
                <Button size="sm" variant="secondary" loading={files.isPending} onClick={() => cadRef.current?.click()}>{p.cad ? 'Replace CAD file' : 'Add CAD file'}</Button>
              </div>
            )}
          </div>
          {isNew && photos.length > 0 && <p className="mb-2 text-xs text-muted">The piece’s catalogue photos go with the PO.</p>}
          {photos.length + pendingImages.length === 0 ? (
            <p className="text-sm text-muted">No photos yet.</p>
          ) : (
            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5">
              {photos.map((img) => (
                <li key={img.stored} className="rounded-sm border border-line bg-surface p-1">
                  {img.url ? (
                    <a href={img.url} target="_blank" rel="noreferrer">
                      <img src={img.url} alt="Design" className="aspect-square w-full rounded-sm object-cover" />
                    </a>
                  ) : (
                    <div className="aspect-square w-full bg-surface-muted" />
                  )}
                  {manageFiles && !isNew && (
                    <button type="button" className="mt-1 w-full text-xs text-danger underline" onClick={() => window.confirm('Remove this photo from the PO?') && removeFile.mutate({ kind: 'image', url: img.stored })}>Remove</button>
                  )}
                </li>
              ))}
              {pendingImages.map((file, i) => (
                <li key={`${file.name}-${i}`} className="rounded-sm border border-dashed border-line bg-surface p-1">
                  <img src={URL.createObjectURL(file)} alt={file.name} className="aspect-square w-full rounded-sm object-cover" />
                  <button type="button" className="mt-1 w-full text-xs text-danger underline" onClick={() => setPendingImages((x) => x.filter((_, j) => j !== i))}>Remove</button>
                </li>
              ))}
            </ul>
          )}
          {!isNew && (
            <p className="mt-3 text-sm">
              <span className="text-muted">CAD file: </span>
              {p.cad ? (
                <>
                  {p.cad.url ? <a href={p.cad.url} className="text-accent underline" target="_blank" rel="noreferrer">{p.cad.name}</a> : p.cad.name}
                  {manageFiles && <button type="button" className="ml-2 text-xs text-danger underline" onClick={() => window.confirm('Remove the CAD file from the PO?') && removeFile.mutate({ kind: 'cad' })}>Remove</button>}
                </>
              ) : (
                'none'
              )}
            </p>
          )}
        </Card>
      )}

      {!isNew && (
        <Card className="mt-4">
          <h2 className="mb-2 font-semibold">Cost and bill</h2>
          <CostRows cost={p.cost} rate={p.makingRatePerGramPaise} gstPercent={p.gstPercent} weight={p.metalWeightG} qty={p.quantity} />
          <Row k="Agreed cost">{inr(p.agreedCostPaise, false)}</Row>
          <h3 className="mt-4 mb-1 text-sm font-semibold">Manufacturer’s bill</h3>
          {p.bill ? (
            <div className="text-sm">
              <Row k="Bill amount">{inr(p.bill.amountPaise, false)}</Row>
              <Row k="Uploaded">{dateTime(p.bill.uploadedAt)}</Row>
              {p.bill.url && <a href={p.bill.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-accent underline">Open the bill</a>}
              <div className="mt-2">
                {p.bill.mismatch ? (
                  <Alert tone="warning">The bill ({inr(p.bill.amountPaise, false)}) differs from the expected {inr(p.bill.expectedPaise, false)} by {inr(Math.abs(p.bill.amountPaise - p.bill.expectedPaise), false)}. Check it before paying.</Alert>
                ) : (
                  <Alert tone="success">The bill matches the expected {inr(p.bill.expectedPaise, false)}.</Alert>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">No bill uploaded yet.</p>
          )}
          {canEdit && (isMaker || isHeadOffice) && ['ACCEPTED', 'IN_PRODUCTION', 'RECEIVED', 'CLOSED'].includes(p.status) && (
            <form
              className="mt-3 flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const amount = toPaise(billAmount);
                if (!billFile || !amount) return toast('Choose the bill file and enter its amount.', 'danger');
                files.mutate({ kind: 'bill', list: [billFile], extra: { amountPaise: String(amount) } });
              }}
            >
              <label className="text-sm">
                Bill amount (₹)
                <Input inputMode="decimal" placeholder={p.cost ? toRupees(p.cost.totalPaise) : ''} value={billAmount} onChange={(e) => setBillAmount(e.target.value)} className="max-w-40" />
              </label>
              <Button type="button" size="sm" variant="secondary" onClick={() => billRef.current?.click()}>{billFile ? billFile.name : 'Choose bill (PDF or photo)'}</Button>
              <input ref={billRef} type="file" accept="application/pdf,image/*" hidden onChange={(e) => setBillFile(e.target.files?.[0] ?? null)} />
              <Button type="submit" size="sm" loading={files.isPending}>{p.bill ? 'Replace bill' : 'Upload bill'}</Button>
            </form>
          )}
        </Card>
      )}

      {!isNew && p.status !== 'DRAFT' && <ManufacturerPayments po={p} canPay={isHeadOffice && canEdit && !!me?.permissions.PAYMENTS?.includes('edit')} onDone={refresh} />}

      {!isNew && p.status !== 'DRAFT' && (
        <Card className="mt-4">
          <h2 className="mb-1 font-semibold">Work status</h2>
          <p className="mb-3 text-xs text-muted">
            The manufacturer updates this as work moves on; head office is emailed on every change. The quality check at pickup is done by head office.
            {isMaker && canStage ? ' Tap the stage you are on.' : ''}
          </p>
          <ol className="mb-3 flex flex-wrap gap-1.5">
            {PO_STAGES.map((s, i) => {
              const on = current === s;
              const done = reached.has(s) && !on;
              const allowed = stageAllowed(s);
              return (
                <li key={s}>
                  <button
                    type="button"
                    disabled={!allowed || stage.isPending}
                    onClick={() => allowed && window.confirm(`Set the work status to “${s}”? Head office is emailed.`) && stage.mutate(s)}
                    className={`rounded-sm border px-2 py-1 text-xs ${on ? 'border-accent bg-accent text-white' : done ? 'border-line bg-surface-muted text-muted line-through' : 'border-line bg-surface'} ${allowed ? 'hover:border-ink' : 'cursor-default'}`}
                  >
                    {i + 1}. {s}
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
                  <Badge tone={i === 0 ? 'success' : 'neutral'}>{normalisePoStage(h.stage)}</Badge>
                  {h.note && <span>{h.note}</span>}
                  <span className="text-xs text-muted">{dateTime(h.at)} · {h.by}</span>
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

const PAY_METHODS: Array<[string, string]> = [['BANK_TRANSFER', 'Bank transfer'], ['UPI', 'UPI'], ['CASH', 'Cash'], ['CHEQUE', 'Cheque'], ['OTHER', 'Other']];
const payMethodLabel = (m: string) => PAY_METHODS.find((x) => x[0] === m)?.[1] ?? humanize(m);

/** Money paid to the manufacturer against this PO, in one go or in parts, with the balance left on the bill. */
function ManufacturerPayments({ po, canPay, onDone }: { po: any; canPay: boolean; onDone: () => Promise<unknown> }) {
  const toast = useToast();
  // Today on the user's own calendar (toISOString would give yesterday's date in India before 5:30 am).
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const blank = { amount: '', method: 'BANK_TRANSFER', reference: '', paidOn: today, note: '' };
  const [v, setV] = useState(blank);
  const payments: Array<{ id: string; amountPaise: number; method: string; reference: string | null; paidOn: string; note: string | null; by: string }> = po.payments ?? [];
  const add = useMutation({
    mutationFn: () => api(`/admin/purchase-orders/${po.id}/payments`, { method: 'POST', json: { amountPaise: toPaise(v.amount), method: v.method, reference: v.reference.trim() || null, paidOn: v.paidOn || undefined, note: v.note.trim() || null } }),
    onSuccess: async () => {
      await onDone();
      setV(blank);
      toast('Payment recorded');
    },
    onError: (e) => toast(errorText(e), 'danger'),
  });
  const remove = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api(`/admin/purchase-orders/${po.id}/payments/${id}/remove`, { method: 'POST', json: { reason } }),
    onSuccess: async () => {
      await onDone();
      toast('Payment removed');
    },
    onError: (e) => toast(errorText(e), 'danger'),
  });
  const f = (k: keyof typeof v) => ({ value: v[k], onChange: (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value }) });
  const amountPaise = toPaise(v.amount || 'x');
  return (
    <Card className="mt-4">
      <h2 className="mb-1 font-semibold">Payments to the manufacturer</h2>
      <p className="mb-3 text-xs text-muted">Record each payment made to {po.manufacturer.name} for this PO. The balance is worked out against {po.bill ? 'their bill' : 'the expected making charge, until their bill is uploaded'}.</p>
      <Row k={po.bill ? 'Bill amount' : 'Expected amount'}>{inr(po.owedPaise, false)}</Row>
      <Row k="Paid so far">{inr(po.paidPaise ?? 0, false)}</Row>
      <Row k="Balance">{po.balancePaise < 0 ? <span className="text-danger">{inr(-po.balancePaise, false)} paid more than owed</span> : po.balancePaise === 0 ? <Badge tone="success">Fully paid</Badge> : inr(po.balancePaise, false)}</Row>
      {payments.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1 text-sm">
          {payments.map((x) => (
            <li key={x.id} className="flex flex-wrap items-baseline gap-2 border-b border-line py-1 last:border-0">
              <strong>{inr(x.amountPaise, false)}</strong>
              <span>{payMethodLabel(x.method)}{x.reference ? ` · ${x.reference}` : ''}</span>
              <span className="text-xs text-muted">paid {date(x.paidOn)} · entered by {x.by}{x.note ? ` · ${x.note}` : ''}</span>
              {canPay && (
                <button type="button" className="ml-auto text-xs text-danger underline" onClick={() => { const reason = window.prompt('Why remove this payment? (kept in the audit log)'); if (reason && reason.trim().length >= 3) remove.mutate({ id: x.id, reason: reason.trim() }); }}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canPay && (
        <form className="mt-4 grid gap-2 md:grid-cols-3" onSubmit={(e) => { e.preventDefault(); if (!amountPaise) return toast('Enter the amount paid.', 'danger'); add.mutate(); }}>
          <label className="text-sm">Amount paid (₹)<Input inputMode="decimal" placeholder={po.balancePaise > 0 ? toRupees(po.balancePaise) : ''} required {...f('amount')} /></label>
          <label className="text-sm">Paid by
            <Select {...f('method')}>{PAY_METHODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
          </label>
          <label className="text-sm">Paid on<Input type="date" max={today} {...f('paidOn')} /></label>
          <label className="text-sm">UTR / cheque no.<Input placeholder="Bank or UPI reference" {...f('reference')} /></label>
          <label className="text-sm md:col-span-2">Note (optional)<Input placeholder="e.g. advance for casting" {...f('note')} /></label>
          <div className="flex flex-wrap items-center gap-2 md:col-span-3">
            <Button type="submit" size="sm" loading={add.isPending}>Record payment</Button>
            {po.balancePaise > 0 && <button type="button" className="text-xs text-accent underline" onClick={() => setV({ ...v, amount: toRupees(po.balancePaise) })}>Fill the balance ({inr(po.balancePaise, false)})</button>}
          </div>
        </form>
      )}
    </Card>
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
