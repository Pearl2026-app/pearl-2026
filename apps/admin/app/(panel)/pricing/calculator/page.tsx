'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Input, Select } from '@sahyadri/ui';
import { useRefOptions } from '@/components/fields';
import { PageHeader } from '@/components/shell';
import { useToast } from '@/components/toast';
import { api, errorText } from '@/lib/api';
import { inr, toPaise } from '@/lib/format';
import { useMe } from '@/lib/session';

interface Result {
  pearlCostPaise: number;
  metalCostPaise: number;
  labourCostPaise: number;
  costPaise: number;
  marginPaise: number;
  exclusivePaise: number;
  gstPaise: number;
  suggestedPricePaise: number;
  ratePerCaratPaise: number;
  gstRateBp: number;
  rate: { grade: string; farm: string; sizeMinMm: number; sizeMaxMm: number; source: string } | null;
  marginRule: { name: string; marginBp: number; minMarginPaise: number | null } | null;
}

const GRADES = ['AAA', 'AA', 'A', 'B'];

export default function CalculatorPage() {
  const toast = useToast();
  const { data: me } = useMe();
  const farms = useRefOptions({ path: '/admin/farms' });
  const cats = useRefOptions({ path: '/admin/categories' });
  const [v, setV] = useState({ carat: '', grade: 'AAA', farmId: '', sizeMm: '', categoryId: '', metal: '', labour: '', rate: '' });
  const [productQ, setProductQ] = useState('');
  const [product, setProduct] = useState<{ id: string; name: string; sku: string; pricePaise: number } | null>(null);
  const feed = useQuery({ queryKey: ['feed-status'], queryFn: () => api<{ name: string; configured: boolean }>('/admin/pricing/feed/status') });
  const found = useQuery({
    queryKey: ['/admin/products', 'calc', productQ],
    queryFn: () => api<{ items: any[] }>(`/admin/products?pageSize=6&q=${encodeURIComponent(productQ)}`),
    enabled: productQ.trim().length >= 2 && !product,
  });
  const calc = useMutation({
    mutationFn: () =>
      api<Result>('/admin/pricing/calculate', {
        method: 'POST',
        json: {
          caratWeight: Number(v.carat),
          grade: v.grade,
          farmId: v.farmId || null,
          sizeMm: v.sizeMm ? Number(v.sizeMm) : null,
          categoryId: v.categoryId || null,
          metalCostPaise: v.metal ? toPaise(v.metal) : undefined,
          labourCostPaise: v.labour ? toPaise(v.labour) : undefined,
          ratePerCaratPaise: v.rate ? toPaise(v.rate) : undefined,
        },
      }),
  });
  const apply = useMutation({
    mutationFn: (r: Result) => api(`/admin/products/${product!.id}`, { method: 'PATCH', json: { pricePaise: r.suggestedPricePaise, pearlCostPaise: r.pearlCostPaise, metalCostPaise: r.metalCostPaise || null, labourCostPaise: r.labourCostPaise || null } }),
    onSuccess: () => toast(`Price applied to ${product!.name}`),
    onError: (e) => toast(errorText(e), 'danger'),
  });
  const pick = (p: any) => {
    setProduct({ id: p.id, name: p.name, sku: p.sku, pricePaise: p.pricePaise });
    setProductQ('');
    setV({ carat: p.caratWeight != null ? String(Number(p.caratWeight)) : '', grade: p.grade ?? 'AAA', farmId: p.farm?.id ?? p.farmId ?? '', sizeMm: p.sizeMm != null ? String(Number(p.sizeMm)) : '', categoryId: p.categoryId ?? p.category?.id ?? '', metal: p.metalCostPaise ? String(p.metalCostPaise / 100) : '', labour: p.labourCostPaise ? String(p.labourCostPaise / 100) : '', rate: '' });
  };
  const f = (k: keyof typeof v) => ({ value: v[k], onChange: (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value }) });
  const r = calc.data;
  const headOffice = me?.role === 'SUPER_ADMIN' || me?.role === 'STAFF';

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Price calculator"
        description={
          <>
            Carat, grade and farm in, a suggested price out, using {headOffice ? <><Link className="text-accent underline" href="/pearl-rates">pearl rates</Link> and <Link className="text-accent underline" href="/margin-rules">margin rules</Link></> : 'the pearl rates and margin rules set by head office'}. Use it to price the catalogue or answer a WhatsApp quote.
            {feed.data && <span className="block text-xs">Live rate feed: {feed.data.configured ? `on (${feed.data.name})` : 'off until a market source is confirmed'}</span>}
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <form className="grid gap-3 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); calc.mutate(); }}>
            <div className="relative md:col-span-2">
              <label className="text-sm">Price an existing piece (optional)
                {product ? (
                  <p className="mt-1 text-sm">{product.name} <span className="text-muted">{product.sku} · now {inr(product.pricePaise)}</span> <button type="button" className="text-accent underline" onClick={() => setProduct(null)}>clear</button></p>
                ) : (
                  <Input placeholder="Search by name or SKU" value={productQ} onChange={(e) => setProductQ(e.target.value)} />
                )}
              </label>
              {found.data && !product && productQ.trim().length >= 2 && (
                <ul className="absolute z-10 mt-1 w-full rounded-sm border border-line bg-surface shadow">
                  {found.data.items.map((p) => <li key={p.id}><button type="button" className="w-full p-2 text-left text-sm hover:bg-surface-muted" onClick={() => pick(p)}>{p.name} <span className="text-muted">{p.sku}</span></button></li>)}
                </ul>
              )}
            </div>
            <label className="text-sm">Carat weight *<Input inputMode="decimal" required {...f('carat')} placeholder="e.g. 2.45" /></label>
            <label className="text-sm">Grade *
              <Select {...f('grade')}>{GRADES.map((g) => <option key={g} value={g}>{g}</option>)}</Select>
            </label>
            <label className="text-sm">Farm
              <Select {...f('farmId')}><option value="">Any farm</option>{farms.data?.items.map((x) => <option key={String(x.id)} value={String(x.id)}>{String(x.name)}</option>)}</Select>
            </label>
            <label className="text-sm">Pearl size (mm)<Input inputMode="decimal" {...f('sizeMm')} /></label>
            <label className="text-sm">Category (for margin and GST)
              <Select {...f('categoryId')}><option value="">—</option>{cats.data?.items.map((x) => <option key={String(x.id)} value={String(x.id)}>{String(x.name)}</option>)}</Select>
            </label>
            <label className="text-sm">Rate per carat ₹ (overrides the table)<Input inputMode="decimal" {...f('rate')} /></label>
            <label className="text-sm">Metal cost ₹<Input inputMode="decimal" {...f('metal')} /></label>
            <label className="text-sm">Making cost ₹<Input inputMode="decimal" {...f('labour')} /></label>
            <div className="md:col-span-2"><Button type="submit" loading={calc.isPending} disabled={!v.carat}>Calculate</Button></div>
          </form>
        </Card>
        <Card aria-live="polite">
          <h2 className="mb-2 font-semibold">Suggested price</h2>
          {calc.error && <Alert tone="danger">{errorText(calc.error)}</Alert>}
          {!r && !calc.error && <p className="text-sm text-muted">Enter the details and calculate.</p>}
          {r && (
            <>
              <p className="font-serif text-3xl">{inr(r.suggestedPricePaise)}</p>
              <p className="mb-3 text-xs text-muted">GST {r.gstRateBp / 100}% included, rounded up</p>
              <dl className="grid grid-cols-2 gap-1 text-sm">
                <dt className="text-muted">Pearl ({inr(r.ratePerCaratPaise)}/ct)</dt><dd className="text-right">{inr(r.pearlCostPaise)}</dd>
                <dt className="text-muted">Metal</dt><dd className="text-right">{inr(r.metalCostPaise)}</dd>
                <dt className="text-muted">Making</dt><dd className="text-right">{inr(r.labourCostPaise)}</dd>
                <dt className="text-muted">Cost</dt><dd className="text-right">{inr(r.costPaise)}</dd>
                <dt className="text-muted">Margin</dt><dd className="text-right">{inr(r.marginPaise)}</dd>
                <dt className="text-muted">Before GST</dt><dd className="text-right">{inr(r.exclusivePaise)}</dd>
                <dt className="text-muted">GST</dt><dd className="text-right">{inr(r.gstPaise)}</dd>
              </dl>
              <p className="mt-3 text-xs text-muted">
                Rate: {r.rate ? `${r.rate.grade}, ${r.rate.farm}, ${r.rate.sizeMinMm}–${r.rate.sizeMaxMm} mm (${r.rate.source === 'FEED' ? 'feed' : 'manual'})` : 'entered by hand'}
                <br />
                Margin: {r.marginRule ? `${r.marginRule.name} (${r.marginRule.marginBp / 100}%${r.marginRule.minMarginPaise ? `, min ${inr(r.marginRule.minMarginPaise)}` : ''})` : 'no rule matched (0%)'}
              </p>
              {product && headOffice && (
                <Button className="mt-3" size="sm" loading={apply.isPending} onClick={() => window.confirm(`Set ${product.name} to ${inr(r.suggestedPricePaise)} (now ${inr(product.pricePaise)})?`) && apply.mutate(r)}>Apply to {product.sku}</Button>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
