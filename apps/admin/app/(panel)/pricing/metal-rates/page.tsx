'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { METAL_RATE_KEYS, METAL_RATE_LABEL, type MetalRateKey } from '@sahyadri/shared';
import { Alert, Badge, Button, Card, Input, Spinner } from '@sahyadri/ui';
import { PageHeader } from '@/components/shell';
import { useToast } from '@/components/toast';
import { api, ApiError, errorText } from '@/lib/api';
import { inr, toPaise, toRupees } from '@/lib/format';
import { useCan } from '@/lib/session';

interface Rate {
  metal: MetalRateKey;
  label: string;
  ratePerGramPaise: number | null;
  effectiveDate: string | null;
  isToday: boolean;
  source: string | null;
}
interface Margin {
  percent: number;
  perGramPaise: number;
}
interface Page {
  date: string;
  feed: { configured: boolean; fromEnv: boolean; url: string | null };
  rates: Rate[];
  history: Array<{ id: string; metal: MetalRateKey; ratePerGramPaise: number; effectiveDate: string; source: string }>;
  margins: Partial<Record<MetalRateKey, Margin>>;
  following: Array<{ id: string; sku: string; name: string; metal: string | null; rateKey: string | null; netWeight: number | null; pricePaise: number; b2bPricePaise: number | null; problem: string | null }>;
}

const day = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Daily gold, silver and platinum rates (meeting of 4 Nov). Head office enters today's rate per gram (or a feed fills
 * it in); products marked "price follows the daily metal rate" are re-priced as soon as a rate or margin is saved.
 */
export default function MetalRatesPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const can = useCan();
  const editable = can('PRICING', 'edit');
  const q = useQuery({ queryKey: ['/admin/metal-rates'], queryFn: () => api<Page>('/admin/metal-rates?days=30') });
  const [date, setDate] = useState('');
  const [rates, setRates] = useState<Partial<Record<MetalRateKey, string>>>({});
  const [margins, setMargins] = useState<Partial<Record<MetalRateKey, { percent: string; perGram: string }>>>({});
  const [feedUrl, setFeedUrl] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!q.data) return;
    setDate((d) => d || q.data.date);
    setRates(Object.fromEntries(q.data.rates.filter((r) => r.ratePerGramPaise != null).map((r) => [r.metal, toRupees(r.ratePerGramPaise!)])));
    setMargins(
      Object.fromEntries(
        METAL_RATE_KEYS.map((k) => {
          const m = q.data.margins[k];
          return [k, { percent: m?.percent ? String(m.percent) : '', perGram: m?.perGramPaise ? toRupees(m.perGramPaise) : '' }];
        }),
      ),
    );
    setFeedUrl(q.data.feed.url ?? '');
  }, [q.data]);

  const done = async (msg: string) => {
    await qc.invalidateQueries({ queryKey: ['/admin/metal-rates'] });
    await qc.invalidateQueries({ queryKey: ['/admin/products'] });
    toast(msg);
  };
  const repriced = (r: { following: number; repriced: number }) =>
    r.following ? ` ${r.repriced} of ${r.following} following ${r.following === 1 ? 'piece' : 'pieces'} re-priced.` : '';

  const saveRates = useMutation({
    mutationFn: () => {
      const list = METAL_RATE_KEYS.filter((k) => (rates[k] ?? '').trim() !== '').map((k) => ({ metal: k, ratePerGramPaise: toPaise(rates[k]!) }));
      const bad = list.find((r) => r.ratePerGramPaise == null || r.ratePerGramPaise <= 0);
      if (bad) throw new ApiError(400, 'VALIDATION_FAILED', `Check the ${METAL_RATE_LABEL[bad.metal]} rate.`, { [bad.metal]: 'Enter ₹ per gram' });
      if (!list.length) throw new ApiError(400, 'VALIDATION_FAILED', 'Enter at least one rate.');
      return api<{ date: string; saved: number; following: number; repriced: number }>('/admin/metal-rates', { method: 'POST', json: { date: date || undefined, rates: list } });
    },
    onSuccess: (r) => {
      setErrors({});
      void done(`${r.saved} ${r.saved === 1 ? 'rate' : 'rates'} saved for ${day(r.date)}.${repriced(r)}`);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.fields) setErrors(e.fields);
      toast(errorText(e), 'danger');
    },
  });
  const saveMargins = useMutation({
    mutationFn: () => {
      const out: Partial<Record<MetalRateKey, Margin>> = {};
      for (const k of METAL_RATE_KEYS) {
        const m = margins[k];
        const percent = m?.percent ? Number(m.percent) : 0;
        const perGramPaise = m?.perGram ? (toPaise(m.perGram) ?? NaN) : 0;
        if (!Number.isFinite(percent) || percent < 0 || !Number.isFinite(perGramPaise) || perGramPaise < 0) throw new ApiError(400, 'VALIDATION_FAILED', `Check the ${METAL_RATE_LABEL[k]} margin.`);
        if (percent || perGramPaise) out[k] = { percent, perGramPaise };
      }
      return api<{ following: number; repriced: number }>('/admin/metal-rates/margins', { method: 'PUT', json: { margins: out, ...(q.data?.feed.fromEnv ? {} : { feedUrl: feedUrl.trim() }) } });
    },
    onSuccess: (r) => void done(`Margins saved.${repriced(r)}`),
    onError: (e) => toast(errorText(e), 'danger'),
  });
  const fetchFeed = useMutation({
    mutationFn: () => api<{ saved: number; following: number; repriced: number }>('/admin/metal-rates/fetch', { method: 'POST', json: {} }),
    onSuccess: (r) => void done(`${r.saved} ${r.saved === 1 ? 'rate' : 'rates'} fetched from the feed.${repriced(r)}`),
    onError: (e) => toast(errorText(e), 'danger'),
  });
  const reprice = useMutation({
    mutationFn: () => api<{ following: number; repriced: number }>('/admin/metal-rates/reprice', { method: 'POST', json: {} }),
    onSuccess: (r) => void done(`Re-priced.${repriced(r) || ' No piece follows the rate yet.'}`),
    onError: (e) => toast(errorText(e), 'danger'),
  });

  if (q.isLoading) return <Spinner />;
  if (q.isError || !q.data) return <Alert tone="danger">{errorText(q.error)}</Alert>;
  const d = q.data;
  const missingToday = d.rates.filter((r) => !r.isToday);

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Metal rates"
        description="Today's gold, silver and platinum rate per gram. Pieces set to “Price follows the daily metal rate” are re-priced the moment a rate or margin is saved; every other piece keeps its own price."
        actions={
          editable && (
            <>
              {d.feed.configured && (
                <Button size="sm" variant="secondary" loading={fetchFeed.isPending} onClick={() => fetchFeed.mutate()}>
                  Fetch from feed
                </Button>
              )}
              <Button size="sm" variant="secondary" loading={reprice.isPending} onClick={() => reprice.mutate()}>
                Re-price now
              </Button>
            </>
          )
        }
      />

      {missingToday.length === d.rates.length && <div className="mb-4"><Alert tone="warning">No rates entered for today yet. Following pieces keep the price from the last rate.</Alert></div>}

      <Card className="mb-4">
        <h2 className="mb-1 font-semibold">Rates per gram</h2>
        <p className="mb-3 text-xs text-muted">
          Enter the rates you use today (₹ per gram). Leave a metal empty to keep its last rate. {d.feed.configured ? 'The feed fills them in once a day if nobody has by then.' : ''}
        </p>
        <form onSubmit={(e) => (e.preventDefault(), saveRates.mutate())}>
          <label className="mb-3 flex max-w-xs flex-col gap-1 text-sm">
            For the day
            <Input type="date" value={date} max={d.date} onChange={(e) => setDate(e.target.value)} disabled={!editable} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {d.rates.map((r) => (
              <label key={r.metal} className="flex flex-col gap-1 text-sm">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-medium">{r.label}</span>
                  {r.ratePerGramPaise != null &&
                    (r.isToday ? <Badge tone="success">{r.source === 'FEED' ? 'Today · feed' : 'Today'}</Badge> : <Badge tone="waiting">{day(r.effectiveDate!)}</Badge>)}
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-muted">₹</span>
                  <Input inputMode="decimal" aria-label={`${r.label} rate per gram`} invalid={!!errors[r.metal]} value={rates[r.metal] ?? ''} onChange={(e) => setRates({ ...rates, [r.metal]: e.target.value })} disabled={!editable} placeholder="per gram" />
                </span>
                {errors[r.metal] && <span className="text-xs text-danger">{errors[r.metal]}</span>}
              </label>
            ))}
          </div>
          {editable && (
            <Button type="submit" size="sm" className="mt-4" loading={saveRates.isPending}>
              Save rates
            </Button>
          )}
        </form>
      </Card>

      <Card className="mb-4">
        <h2 className="mb-1 font-semibold">Margin per metal</h2>
        <p className="mb-3 text-xs text-muted">
          Added to the metal value of following pieces: a percentage, a fixed ₹ per gram, or both. Price = net weight × rate × (1 + %) + net weight × ₹/g + making + pearl cost, rounded up to ₹10. The business (B2B) price follows the discount in Settings.
        </p>
        <form onSubmit={(e) => (e.preventDefault(), saveMargins.mutate())}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead className="text-left text-muted">
                <tr>
                  <th className="py-1 pr-3 font-normal">Metal</th>
                  <th className="py-1 pr-3 font-normal">Margin %</th>
                  <th className="py-1 font-normal">Margin ₹ per gram</th>
                </tr>
              </thead>
              <tbody>
                {METAL_RATE_KEYS.map((k) => (
                  <tr key={k} className="border-t border-line">
                    <td className="py-2 pr-3">{METAL_RATE_LABEL[k]}</td>
                    <td className="py-2 pr-3">
                      <Input inputMode="decimal" aria-label={`${METAL_RATE_LABEL[k]} margin percent`} className="max-w-28" value={margins[k]?.percent ?? ''} onChange={(e) => setMargins({ ...margins, [k]: { percent: e.target.value, perGram: margins[k]?.perGram ?? '' } })} disabled={!editable} placeholder="0" />
                    </td>
                    <td className="py-2">
                      <Input inputMode="decimal" aria-label={`${METAL_RATE_LABEL[k]} margin rupees per gram`} className="max-w-32" value={margins[k]?.perGram ?? ''} onChange={(e) => setMargins({ ...margins, [k]: { percent: margins[k]?.percent ?? '', perGram: e.target.value } })} disabled={!editable} placeholder="0" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 max-w-xl">
            <label className="flex flex-col gap-1 text-sm">
              Daily rate feed (optional)
              {d.feed.fromEnv ? (
                <span className="text-xs text-muted">Set up on the server (METAL_RATE_FEED_URL); rates are fetched once a day.</span>
              ) : (
                <>
                  <Input type="url" placeholder="https://… (JSON)" value={feedUrl} onChange={(e) => setFeedUrl(e.target.value)} disabled={!editable} />
                  <span className="text-xs text-muted">A link that returns today’s rates as JSON, e.g. {'{"GOLD_22K": 6500, "SILVER_925": 95}'} (₹ per gram). Empty = enter rates by hand.</span>
                </>
              )}
            </label>
          </div>
          {editable && (
            <Button type="submit" size="sm" className="mt-4" loading={saveMargins.isPending}>
              Save margins
            </Button>
          )}
        </form>
      </Card>

      <Card className="mb-4 overflow-x-auto p-0">
        <h2 className="px-3 pt-3 font-semibold">Pieces whose price follows the rate ({d.following.length})</h2>
        <p className="px-3 text-xs text-muted">Turn it on per piece under Products → Price and costs.</p>
        <table className="mt-2 w-full min-w-[640px] text-sm">
          <thead className="border-b border-line text-left text-muted">
            <tr>
              <th className="px-3 py-2 font-normal">Piece</th>
              <th className="px-3 py-2 font-normal">Rate</th>
              <th className="px-3 py-2 text-right font-normal">Net weight</th>
              <th className="px-3 py-2 text-right font-normal">Price</th>
              <th className="px-3 py-2 text-right font-normal">Business price</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {d.following.map((p) => (
              <tr key={p.id}>
                <td className="px-3 py-2">
                  <Link href={`/products/${p.id}`} className="text-accent underline">
                    {p.name}
                  </Link>{' '}
                  <span className="text-muted">· {p.sku}</span>
                  {p.problem && <span className="block text-xs text-danger">{p.problem}; the price is not changing.</span>}
                </td>
                <td className="px-3 py-2">{p.rateKey ? (METAL_RATE_LABEL[p.rateKey as MetalRateKey] ?? p.rateKey) : (p.metal ?? '—')}</td>
                <td className="px-3 py-2 text-right">{p.netWeight != null ? `${p.netWeight} g` : '—'}</td>
                <td className="px-3 py-2 text-right">{inr(p.pricePaise)}</td>
                <td className="px-3 py-2 text-right">{p.b2bPricePaise != null ? inr(p.b2bPricePaise) : '—'}</td>
              </tr>
            ))}
            {!d.following.length && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted">
                  No piece follows the daily rate yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Card className="overflow-x-auto p-0">
        <h2 className="px-3 pt-3 font-semibold">Last 30 days</h2>
        <table className="mt-2 w-full min-w-[480px] text-sm">
          <thead className="border-b border-line text-left text-muted">
            <tr>
              <th className="px-3 py-2 font-normal">Day</th>
              {METAL_RATE_KEYS.map((k) => (
                <th key={k} className="px-3 py-2 text-right font-normal">
                  {METAL_RATE_LABEL[k]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {[...new Set(d.history.map((h) => h.effectiveDate.slice(0, 10)))].map((dt) => (
              <tr key={dt}>
                <td className="px-3 py-2">{day(dt)}</td>
                {METAL_RATE_KEYS.map((k) => {
                  const h = d.history.find((x) => x.metal === k && x.effectiveDate.slice(0, 10) === dt);
                  return (
                    <td key={k} className="px-3 py-2 text-right tabular-nums">
                      {h ? inr(h.ratePerGramPaise) : '—'}
                    </td>
                  );
                })}
              </tr>
            ))}
            {!d.history.length && (
              <tr>
                <td colSpan={METAL_RATE_KEYS.length + 1} className="px-3 py-6 text-center text-muted">
                  No rates entered yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
