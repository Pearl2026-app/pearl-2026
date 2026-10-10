'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { cx } from '@sahyadri/ui';
import type { Filters } from '@/lib/types';
import { CloseIcon } from './icons';

const SORTS = [
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'carat_desc', label: 'Carat: high to low' },
  { value: 'carat_asc', label: 'Carat: low to high' },
];

function useParamsUpdate() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const update = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    p.delete('page');
    start(() => router.push(`${pathname}${p.toString() ? `?${p}` : ''}`, { scroll: false }));
  };
  return { sp, update, pending };
}

export function SortSelect() {
  const { sp, update } = useParamsUpdate();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted">Sort</span>
      <select value={sp.get('sort') ?? 'newest'} onChange={(e) => update({ sort: e.target.value === 'newest' ? null : e.target.value })} className="min-h-11 border border-line bg-surface px-3">
        {SORTS.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>
    </label>
  );
}

function Chips({ name, options, label }: { name: string; options: Array<{ value: string; label?: string; count: number }>; label: string }) {
  const { sp, update } = useParamsUpdate();
  const selected = new Set((sp.get(name) ?? '').split(',').filter(Boolean));
  if (!options.length) return null;
  return (
    <fieldset className="border-b border-line py-5">
      <legend className="eyebrow mb-3">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = selected.has(o.value);
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => {
                const next = new Set(selected);
                if (on) next.delete(o.value);
                else next.add(o.value);
                update({ [name]: [...next].join(',') || null });
              }}
              className={cx('min-h-10 border px-3 text-sm transition-colors', on ? 'border-accent bg-accent text-white' : 'border-line bg-surface hover:border-ink')}
            >
              {o.label ?? o.value} <span className={on ? 'text-white/70' : 'text-muted'}>({o.count})</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function Range({ label, minKey, maxKey, unit, bounds }: { label: string; minKey: string; maxKey: string; unit: string; bounds: { min: number; max: number } }) {
  const { sp, update } = useParamsUpdate();
  const [min, setMin] = useState(sp.get(minKey) ?? '');
  const [max, setMax] = useState(sp.get(maxKey) ?? '');
  useEffect(() => {
    setMin(sp.get(minKey) ?? '');
    setMax(sp.get(maxKey) ?? '');
  }, [sp, minKey, maxKey]);
  return (
    <fieldset className="border-b border-line py-5">
      <legend className="eyebrow mb-3">{label}</legend>
      <form className="flex items-center gap-2" onSubmit={(e) => (e.preventDefault(), update({ [minKey]: min || null, [maxKey]: max || null }))}>
        <input aria-label={`Minimum ${label}`} inputMode="decimal" placeholder={`${unit}${Math.floor(bounds.min)}`} value={min} onChange={(e) => setMin(e.target.value)} className="min-h-11 w-full border border-line bg-surface px-2 text-sm" />
        <span className="text-muted">–</span>
        <input aria-label={`Maximum ${label}`} inputMode="decimal" placeholder={`${unit}${Math.ceil(bounds.max)}`} value={max} onChange={(e) => setMax(e.target.value)} className="min-h-11 w-full border border-line bg-surface px-2 text-sm" />
        <button type="submit" className="min-h-11 border border-ink px-3 text-sm">Go</button>
      </form>
    </fieldset>
  );
}

function Panel({ filters, hide }: { filters: Filters; hide: string[] }) {
  const { sp, update } = useParamsUpdate();
  return (
    <div>
      {!hide.includes('category') && <Chips name="category" label="Category" options={filters.categories.map((c) => ({ value: c.slug, label: c.name, count: c.count }))} />}
      {!hide.includes('collection') && <Chips name="collection" label="Collection" options={filters.collections.map((c) => ({ value: c.slug, label: c.name, count: c.count }))} />}
      {!hide.includes('farm') && <Chips name="farm" label="Farm" options={filters.farms.map((c) => ({ value: c.slug, label: c.name, count: c.count }))} />}
      <Range label="Carat" minKey="carat_min" maxKey="carat_max" unit="" bounds={filters.carat} />
      <Chips name="shape" label="Shape" options={filters.shapes} />
      <Chips name="colour" label="Colour" options={filters.colours} />
      <Range label="Price" minKey="price_min" maxKey="price_max" unit="₹" bounds={{ min: filters.price.min / 100, max: filters.price.max / 100 }} />
      <label className="flex min-h-12 items-center gap-3 py-4 text-sm">
        <input type="checkbox" className="h-5 w-5 accent-[var(--color-accent)]" checked={sp.get('in_stock') === '1'} onChange={(e) => update({ in_stock: e.target.checked ? '1' : null })} />
        Available now
      </label>
    </div>
  );
}

const FILTER_KEYS = ['category', 'collection', 'farm', 'shape', 'colour', 'carat_min', 'carat_max', 'price_min', 'price_max', 'in_stock'];

export function FilterPanel({ filters, hide }: { filters: Filters; hide: string[] }) {
  const [open, setOpen] = useState(false);
  const { sp, update, pending } = useParamsUpdate();
  const active = FILTER_KEYS.filter((k) => sp.get(k));
  const clear = () => update(Object.fromEntries(FILTER_KEYS.map((k) => [k, null])));
  return (
    <>
      <div className="mb-4 flex items-center gap-3 lg:hidden">
        <button onClick={() => setOpen(true)} className="min-h-11 border border-ink px-5 text-sm" aria-expanded={open}>
          Filter{active.length ? ` (${active.length})` : ''}
        </button>
        {active.length > 0 && <button onClick={clear} className="text-sm text-accent underline">Clear all</button>}
        {pending && <span className="text-xs text-muted">Updating…</span>}
      </div>
      <aside className="hidden lg:block" aria-label="Filters">
        <div className="sticky top-28">
          <div className="flex items-center justify-between">
            <p className="font-serif text-2xl">Filter</p>
            {active.length > 0 && <button onClick={clear} className="text-sm text-accent underline">Clear all</button>}
          </div>
          <Panel filters={filters} hide={hide} />
        </div>
      </aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Filters">
          <button className="absolute inset-0 bg-ink/30" onClick={() => setOpen(false)} aria-label="Close filters" />
          <div className="fade-in absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto bg-bg px-5 pb-28">
            <div className="sticky top-0 flex items-center justify-between bg-bg py-4">
              <p className="font-serif text-2xl">Filter</p>
              <button onClick={() => setOpen(false)} className="flex h-11 w-11 items-center justify-center" aria-label="Close filters"><CloseIcon /></button>
            </div>
            <Panel filters={filters} hide={hide} />
            <div className="fixed inset-x-0 bottom-0 flex gap-3 border-t border-line bg-bg p-4">
              <button onClick={clear} className="min-h-12 flex-1 border border-ink text-sm">Clear</button>
              <button onClick={() => setOpen(false)} className="min-h-12 flex-1 bg-accent text-sm text-white">Show results</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
