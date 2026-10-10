'use client';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { quoteCustom } from '@sahyadri/shared';
import { Alert, Button, Card, Input, Select, Spinner, Textarea } from '@sahyadri/ui';
import { useRefOptions } from '@/components/fields';
import { PageHeader } from '@/components/shell';
import { useToast } from '@/components/toast';
import { api, errorText } from '@/lib/api';
import { STAGES } from '@/lib/custom';
import { dateTime, humanize, inr, toPaise, toRupees } from '@/lib/format';
import { useCan, useMe } from '@/lib/session';

type Details = { jewelleryType: string; metal: string; size: string; weightGrams: string; pearlDetails: string; designNotes: string; budget: string; extraNotes: string };
const EMPTY: Details = { jewelleryType: '', metal: '', size: '', weightGrams: '', pearlDetails: '', designNotes: '', budget: '', extraNotes: '' };
const blank = (s: string) => (s.trim() ? s.trim() : null);
const detailsBody = (d: Details) => ({
  jewelleryType: d.jewelleryType.trim(),
  metal: blank(d.metal),
  size: blank(d.size),
  weightGrams: d.weightGrams ? Number(d.weightGrams) : null,
  pearlDetails: blank(d.pearlDetails),
  designNotes: blank(d.designNotes),
  budgetPaise: d.budget ? toPaise(d.budget) : null,
  extraNotes: blank(d.extraNotes),
});

function DetailFields({ d, set, disabled }: { d: Details; set: (d: Details) => void; disabled?: boolean }) {
  const f = (k: keyof Details) => ({ value: d[k], disabled, onChange: (e: { target: { value: string } }) => set({ ...d, [k]: e.target.value }) });
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <label className="text-sm">Jewellery type *<Input required {...f('jewelleryType')} placeholder="Ring, necklace, mangalsutra…" /></label>
      <label className="text-sm">Metal<Input {...f('metal')} placeholder="18k gold, silver…" /></label>
      <label className="text-sm">Size<Input {...f('size')} /></label>
      <label className="text-sm">Weight (grams)<Input inputMode="decimal" {...f('weightGrams')} /></label>
      <label className="text-sm md:col-span-2">Pearl details<Input {...f('pearlDetails')} placeholder="Type, size, colour, shape, count" /></label>
      <label className="text-sm md:col-span-2">Design notes<Textarea rows={3} {...f('designNotes')} /></label>
      <label className="text-sm">Customer budget (₹)<Input inputMode="decimal" {...f('budget')} /></label>
      <label className="text-sm">Extra notes<Input {...f('extraNotes')} /></label>
    </div>
  );
}

function NewCustomOrder() {
  const router = useRouter();
  const sp = useSearchParams();
  const enquiryId = sp.get('enquiryId');
  const toast = useToast();
  const cities = useRefOptions({ path: '/admin/cities', query: { isActive: 'true' } });
  const [d, setD] = useState<Details>(EMPTY);
  const [contact, setContact] = useState({ name: '', phone: '', email: '' });
  const [cityId, setCityId] = useState('');
  const create = useMutation({
    mutationFn: () => api<{ id: string }>('/admin/custom-orders', { method: 'POST', json: { ...detailsBody(d), ...(enquiryId ? { enquiryId } : { contact: { ...contact, email: blank(contact.email) } }), cityId: cityId || null } }),
    onSuccess: (r) => {
      toast('Customized order started');
      router.replace(`/custom-orders/${r.id}`);
    },
  });
  return (
    <div className="max-w-4xl">
      <PageHeader title="New customized order" description={<Link href="/custom-orders" className="text-accent hover:underline">← Customized orders</Link>} />
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
        {create.error && <Alert tone="danger">{errorText(create.error)}</Alert>}
        {enquiryId ? (
          <Alert tone="info">The customer’s details come from the enquiry.</Alert>
        ) : (
          <Card className="grid gap-3 md:grid-cols-3">
            <h2 className="font-semibold md:col-span-3">Customer</h2>
            <Input aria-label="Customer name" placeholder="Name" required value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} />
            <Input aria-label="Customer mobile" placeholder="Mobile" required value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
            <Input aria-label="Customer email" placeholder="Email (optional)" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
          </Card>
        )}
        <Card className="flex flex-col gap-3">
          <h2 className="font-semibold">Requirement</h2>
          <Select aria-label="City" value={cityId} onChange={(e) => setCityId(e.target.value)} className="max-w-xs">
            <option value="">{enquiryId ? 'City from the enquiry' : 'Choose the city'}</option>
            {cities.data?.items.map((c) => <option key={String(c.id)} value={String(c.id)}>{String(c.name)}</option>)}
          </Select>
          <DetailFields d={d} set={setD} />
        </Card>
        <div><Button type="submit" loading={create.isPending}>Start customized order</Button></div>
      </form>
    </div>
  );
}

function Advance({ c, onDone }: { c: any; onDone: () => void }) {
  const toast = useToast();
  const [v, setV] = useState({ amount: '', method: 'BANK_TRANSFER', reference: '', line1: '', area: '', landmark: '', pincode: '', cityName: c.city?.name ?? '', state: 'Maharashtra' });
  const save = useMutation({
    mutationFn: () =>
      api(`/admin/custom-orders/${c.id}/stage`, {
        method: 'POST',
        json: {
          stage: 'ADVANCE_PAID',
          advance: {
            amountPaise: toPaise(v.amount),
            method: v.method,
            reference: blank(v.reference),
            address: { name: c.contact.name, phone: c.contact.phone, line1: v.line1, area: blank(v.area), landmark: blank(v.landmark), cityName: v.cityName, state: v.state, pincode: v.pincode, cityId: c.city?.id ?? null },
          },
        },
      }),
    onSuccess: () => {
      toast('Advance recorded; the order is created');
      onDone();
    },
  });
  const f = (k: keyof typeof v) => ({ value: v[k], onChange: (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value }) });
  return (
    <form className="grid gap-2 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <h3 className="font-semibold md:col-span-2">Record the advance</h3>
      <p className="text-xs text-muted md:col-span-2">This creates the order for {inr(c.quotedPaise)}. The balance is recorded on the order later.</p>
      {save.error && <div className="md:col-span-2"><Alert tone="danger">{errorText(save.error)}</Alert></div>}
      <Input aria-label="Advance amount" placeholder="Advance ₹" required inputMode="decimal" {...f('amount')} />
      <Select aria-label="Paid by" {...f('method')}>
        <option value="BANK_TRANSFER">Bank transfer / UPI</option>
        <option value="COD">Cash</option>
        <option value="OTHER">Other</option>
      </Select>
      <Input aria-label="Payment reference" placeholder="Reference" {...f('reference')} />
      <Input aria-label="Delivery address" placeholder="Delivery address: house, street" required {...f('line1')} />
      <Input aria-label="Area" placeholder="Area" {...f('area')} />
      <Input aria-label="Landmark" placeholder="Landmark" {...f('landmark')} />
      <Input aria-label="Town / city" placeholder="Town / city" required {...f('cityName')} />
      <Input aria-label="Pincode" placeholder="Pincode" required inputMode="numeric" {...f('pincode')} />
      <Input aria-label="State" placeholder="State" required {...f('state')} />
      <div className="md:col-span-2"><Button type="submit" loading={save.isPending}>Record advance and create order</Button></div>
    </form>
  );
}

function CustomOrder({ id }: { id: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const can = useCan();
  const { data: me } = useMe();
  const { data: c, isLoading } = useQuery({ queryKey: ['/admin/custom-orders', id], queryFn: () => api<any>(`/admin/custom-orders/${id}`) });
  const [d, setD] = useState<Details>(EMPTY);
  const [cost, setCost] = useState({ metal: '', labour: '', pearl: '', margin: '' });
  const files = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!c) return;
    setD({ jewelleryType: c.jewelleryType ?? '', metal: c.metal ?? '', size: c.size ?? '', weightGrams: c.weightGrams != null ? String(c.weightGrams) : '', pearlDetails: c.pearlDetails ?? '', designNotes: c.designNotes ?? '', budget: toRupees(c.budgetPaise), extraNotes: c.extraNotes ?? '' });
    setCost({ metal: toRupees(c.metalCostPaise), labour: toRupees(c.labourCostPaise), pearl: toRupees(c.pearlCostPaise), margin: toRupees(c.marginPaise) });
  }, [c]);
  const refresh = () => qc.invalidateQueries({ queryKey: ['/admin/custom-orders'] });
  const act = useMutation({
    mutationFn: ({ path, method = 'POST', json, body }: { path: string; method?: string; json?: unknown; body?: FormData }) => api(`/admin/custom-orders/${id}${path}`, { method, json, body }),
    onSuccess: async () => {
      await refresh();
      toast('Saved');
    },
    onError: (e) => toast(errorText(e), 'danger'),
  });
  if (isLoading || !c || !me) return <Spinner />;
  const headOffice = me.role === 'SUPER_ADMIN' || me.role === 'STAFF';
  const editable = can('CUSTOM_ORDERS', 'edit');
  const i = STAGES.indexOf(c.stage);
  const next = STAGES[i + 1];
  const prev = i > 0 && !(i >= 2 && i - 1 < 2) ? STAGES[i - 1] : undefined;
  const costPaise = { metalCostPaise: toPaise(cost.metal || '0') ?? 0, labourCostPaise: toPaise(cost.labour || '0') ?? 0, pearlCostPaise: toPaise(cost.pearl || '0') ?? 0, marginPaise: toPaise(cost.margin || '0') ?? 0 };
  const preview = quoteCustom({ ...costPaise, gstRateBp: c.gstRateBp });
  const quoteOpen = c.stage === 'REQUIREMENT' || c.stage === 'QUOTED';
  const move = (stage: string) => {
    const note = window.prompt(`Note for moving to “${humanize(stage)}” (optional)`) ?? undefined;
    act.mutate({ path: '/stage', json: { stage, note: note || null } });
  };

  return (
    <div className="max-w-6xl">
      <PageHeader
        title={`Customized ${c.jewelleryType}`}
        description={
          <span className="flex flex-wrap gap-2">
            <Link href="/custom-orders" className="text-accent hover:underline">← Customized orders</Link>
            {c.enquiry && <Link href={`/enquiries/${c.enquiry.id}`} className="text-accent underline">{c.enquiry.reference}</Link>}
            {c.order && <Link href={`/orders/${c.order.id}`} className="text-accent underline">Order {c.order.number}</Link>}
          </span>
        }
      />
      <ol className="mb-4 flex flex-wrap gap-1 text-xs" aria-label="Production stages">
        {STAGES.map((s, j) => (
          <li key={s} aria-current={s === c.stage ? 'step' : undefined} className={`rounded-full px-3 py-1 ${j < i ? 'bg-accent-soft text-accent' : j === i ? 'bg-accent text-white' : 'bg-surface-muted text-muted'}`}>{humanize(s)}</li>
        ))}
      </ol>
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-4">
          <Card>
            <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); act.mutate({ path: '', method: 'PATCH', json: detailsBody(d) }); }}>
              <h2 className="font-semibold">Requirement</h2>
              <DetailFields d={d} set={setD} disabled={!editable} />
              {editable && <div><Button type="submit" size="sm" variant="secondary">Save details</Button></div>}
            </form>
          </Card>
          {headOffice ? (
            <Card>
              <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); act.mutate({ path: '', method: 'PATCH', json: { costs: costPaise } }); }}>
                <h2 className="font-semibold">Cost breakdown and quote</h2>
                <div className="grid gap-2 md:grid-cols-4">
                  {(['metal', 'labour', 'pearl', 'margin'] as const).map((k) => (
                    <label key={k} className="text-sm">{humanize(k)} ₹<Input inputMode="decimal" disabled={!quoteOpen} value={cost[k]} onChange={(e) => setCost({ ...cost, [k]: e.target.value })} /></label>
                  ))}
                </div>
                <p className="text-sm">Before GST {inr(preview.exclusivePaise)} + GST {c.gstRateBp / 100}% {inr(preview.gstPaise)} = <strong>quote {inr(preview.quotedPaise)}</strong>{c.quotedPaise != null && c.quotedPaise !== preview.quotedPaise && <span className="text-muted"> (saved: {inr(c.quotedPaise)})</span>}</p>
                {quoteOpen ? <div><Button type="submit" size="sm">Save quote</Button></div> : <p className="text-xs text-muted">The quote is locked once the advance is paid.</p>}
              </form>
            </Card>
          ) : (
            <Card><h2 className="font-semibold">Quote</h2><p className="text-sm">{c.quotedPaise != null ? inr(c.quotedPaise) : 'Head office has not quoted yet.'}</p></Card>
          )}
          <Card>
            <h2 className="mb-2 font-semibold">Images and design files</h2>
            <div className="flex flex-wrap gap-2">
              {c.referenceImages.map((u: string, j: number) => <a key={u} href={u} target="_blank" rel="noreferrer"><img src={u} alt={`Customer reference ${j + 1}`} className="h-24 w-24 rounded-sm border border-line object-cover" /></a>)}
              {c.designFiles.map((u: string, j: number) => <a key={u} href={u} target="_blank" rel="noreferrer" className="flex h-24 w-24 items-center justify-center rounded-sm border border-line text-xs text-accent underline">Design file {j + 1}</a>)}
              {!c.referenceImages.length && !c.designFiles.length && <p className="text-sm text-muted">None yet.</p>}
            </div>
            {editable && (
              <div className="mt-3">
                <input ref={files} type="file" multiple accept="image/*,application/pdf,.doc,.docx" className="text-sm" aria-label="Design files" />
                <Button size="sm" variant="secondary" className="ml-2" onClick={() => { const fd = new FormData(); for (const f of Array.from(files.current?.files ?? [])) fd.append('files', f); act.mutate({ path: '/files', body: fd }); }}>Upload</Button>
              </div>
            )}
          </Card>
          {c.stage === 'QUOTED' && editable && (me.role === 'SUPER_ADMIN' || me.role === 'STAFF' || me.role === 'CITY_MANAGER') && (
            <Card><Advance c={c} onDone={refresh} /></Card>
          )}
        </div>
        <div className="flex flex-col gap-4">
          <Card>
            <h2 className="mb-1 font-semibold">Customer</h2>
            <p className="text-sm">{c.contact.name ?? '—'}<br />{c.contact.phone}{c.contact.email && <><br />{c.contact.email}</>}</p>
            <p className="mt-1 text-sm text-muted">{c.city?.name ?? 'City not set'}{c.budgetPaise ? ` · budget ${inr(c.budgetPaise)}` : ''}</p>
          </Card>
          {editable && (
            <Card className="flex flex-col gap-2">
              <h2 className="font-semibold">Stage</h2>
              {next === 'PO_RAISED' && !c.order?.purchaseOrders.length && <p className="text-xs text-muted">Raise a purchase order to move on.</p>}
              {next && !['ADVANCE_PAID', 'DISPATCHED', 'DELIVERED'].includes(next) && !(next === 'PO_RAISED' && !c.order?.purchaseOrders.length) && <Button size="sm" onClick={() => move(next)} loading={act.isPending}>Move to {humanize(next).toLowerCase()}</Button>}
              {next === 'ADVANCE_PAID' && <p className="text-xs text-muted">Record the advance to move on.</p>}
              {(next === 'DISPATCHED' || next === 'DELIVERED') && <p className="text-xs text-muted">Dispatch and delivery follow the order’s delivery steps.</p>}
              {prev && !['DISPATCHED', 'DELIVERED'].includes(c.stage) && <Button size="sm" variant="ghost" onClick={() => move(prev)}>Back to {humanize(prev).toLowerCase()}</Button>}
            </Card>
          )}
          {c.order && (
            <Card>
              <h2 className="mb-1 font-semibold">Order and payments</h2>
              <p className="text-sm">Total {inr(c.order.totalPaise)} · paid {inr(c.paidPaise)} · due {inr(c.order.totalPaise - c.paidPaise)}</p>
              <Link className="text-sm text-accent underline" href={`/orders/${c.order.id}`}>Open order {c.order.number}</Link>
            </Card>
          )}
          {c.order && (
            <Card>
              <h2 className="mb-1 font-semibold">Purchase orders</h2>
              {c.order.purchaseOrders.map((p: any) => <p key={p.id} className="text-sm"><Link href={`/purchase-orders/${p.id}`} className="text-accent underline">{p.number}</Link> · {p.manufacturer.name} · {humanize(p.status)}</p>)}
              {!c.order.purchaseOrders.length && <p className="text-sm text-muted">None yet.</p>}
              {can('PURCHASE_ORDERS', 'create') && <Link className="mt-2 inline-block text-sm text-accent underline" href={`/purchase-orders/new?customRequestId=${c.id}`}>Raise a purchase order</Link>}
            </Card>
          )}
          <Card>
            <h2 className="mb-1 font-semibold">History</h2>
            <ol className="text-sm">
              {((c.stageHistory as Array<{ stage: string; at: string; by: string; note?: string | null }>) ?? []).map((h, j) => (
                <li key={j} className="border-l-2 border-line py-1 pl-2">{humanize(h.stage)}{h.note ? `: ${h.note}` : ''}<span className="block text-xs text-muted">{dateTime(h.at)} · {h.by}</span></li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function CustomOrderPage() {
  const { id } = useParams<{ id: string }>();
  return id === 'new' ? (
    <Suspense>
      <NewCustomOrder />
    </Suspense>
  ) : (
    <CustomOrder id={id} />
  );
}
