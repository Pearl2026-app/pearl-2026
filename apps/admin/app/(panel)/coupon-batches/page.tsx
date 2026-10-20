'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Button, Card, Input, Select } from '@sahyadri/ui';
import { useRefOptions } from '@/components/fields';
import { PageHeader } from '@/components/shell';
import { useToast } from '@/components/toast';

/**
 * Printed partner-brand coupons (meeting of 19 Oct): a silk store or beauty shop hands out printed cards; each card
 * carries a unique one-use code that works on the website. This generates the whole batch and downloads a CSV for
 * the printer.
 */
export default function CouponBatchesPage() {
  const toast = useToast();
  const cities = useRefOptions({ path: '/admin/cities' });
  const [v, setV] = useState({ prefix: 'SILK', count: '500', discountType: 'FLAT', value: '500', minOrder: '2000', maxDiscount: '', endsAt: '', cityId: '', description: '' });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));

  const run = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/v1/admin/coupons/bulk-generate', {
        method: 'POST',
        headers: { 'X-SP-Client': 'admin', 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          prefix: v.prefix.trim().toUpperCase(),
          count: Number(v.count),
          description: v.description.trim() || null,
          discountType: v.discountType,
          discountValue: v.discountType === 'PERCENT' ? Math.round(Number(v.value) * 100) : Math.round(Number(v.value) * 100),
          minOrderPaise: v.minOrder ? Math.round(Number(v.minOrder) * 100) : 0,
          maxDiscountPaise: v.maxDiscount ? Math.round(Number(v.maxDiscount) * 100) : null,
          endsAt: v.endsAt ? new Date(v.endsAt + 'T23:59:59').toISOString() : null,
          cityId: v.cityId || null,
        }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(b.message ?? 'The batch could not be generated.');
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `coupons-${v.prefix.toLowerCase()}.csv`;
      a.click();
      toast(`${v.count} codes generated and downloaded. They are live immediately.`);
    } catch (e) {
      toast((e as Error).message, 'danger');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Printed coupon batches"
        description="Unique one-use codes for partner brands (silk stores, beauty shops…). The batch downloads as a CSV for the printer; each code works once at checkout, anywhere in India unless you pick a city."
        actions={
          <Link href="/coupons" className="inline-flex min-h-9 items-center rounded-sm border border-line bg-surface px-3 text-sm">
            All coupons
          </Link>
        }
      />
      <Card className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">
          Code prefix
          <Input className="mt-1" value={v.prefix} maxLength={10} onChange={set('prefix')} placeholder="SILK" />
          <span className="mt-1 block text-xs text-muted">Codes look like {`${v.prefix.toUpperCase() || 'SILK'}-7G4K2M`}.</span>
        </label>
        <label className="text-sm">
          How many codes
          <Input className="mt-1" inputMode="numeric" value={v.count} onChange={set('count')} />
          <span className="mt-1 block text-xs text-muted">Up to 2,000 per batch.</span>
        </label>
        <label className="text-sm">
          Discount type
          <Select className="mt-1" value={v.discountType} onChange={set('discountType')}>
            <option value="FLAT">Flat amount (₹)</option>
            <option value="PERCENT">Percentage (%)</option>
          </Select>
        </label>
        <label className="text-sm">
          {v.discountType === 'PERCENT' ? 'Percent off' : 'Amount off (₹)'}
          <Input className="mt-1" inputMode="decimal" value={v.value} onChange={set('value')} />
        </label>
        <label className="text-sm">
          Minimum order (₹)
          <Input className="mt-1" inputMode="decimal" value={v.minOrder} onChange={set('minOrder')} />
        </label>
        {v.discountType === 'PERCENT' && (
          <label className="text-sm">
            Maximum discount (₹, optional)
            <Input className="mt-1" inputMode="decimal" value={v.maxDiscount} onChange={set('maxDiscount')} />
          </label>
        )}
        <label className="text-sm">
          Valid until (optional)
          <Input className="mt-1" type="date" value={v.endsAt} onChange={set('endsAt')} />
        </label>
        <label className="text-sm">
          Only for deliveries in (optional)
          <Select className="mt-1" value={v.cityId} onChange={set('cityId')}>
            <option value="">Anywhere in India</option>
            {(cities.data?.items ?? []).map((c) => (
              <option key={String(c.id)} value={String(c.id)}>
                {String(c.name)}
              </option>
            ))}
          </Select>
        </label>
        <label className="text-sm sm:col-span-2">
          Shown to the customer as (optional)
          <Input className="mt-1" value={v.description} maxLength={300} onChange={set('description')} placeholder="₹500 off, with love from Silk & Co." />
        </label>
        <div className="sm:col-span-2">
          <Button loading={busy} disabled={!v.prefix.trim() || !Number(v.count) || !Number(v.value)} onClick={run}>
            Generate and download the codes
          </Button>
        </div>
      </Card>
    </div>
  );
}
