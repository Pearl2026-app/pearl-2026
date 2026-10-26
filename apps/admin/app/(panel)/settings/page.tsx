'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, Spinner, Switch } from '@sahyadri/ui';
import { FieldInput, type FieldDef } from '@/components/fields';
import { PageHeader } from '@/components/shell';
import { useToast } from '@/components/toast';
import { api, ApiError, errorText } from '@/lib/api';
import { useCan, useMe } from '@/lib/session';

const GROUPS: Array<{ key: string; title: string; fields: FieldDef[] }> = [
  {
    key: 'store',
    title: 'Business details (printed on invoices)',
    fields: [
      { name: 'legalName', label: 'Legal name' },
      { name: 'gstin', label: 'GSTIN', hint: 'Invoices are marked SAMPLE until this is filled in.' },
      { name: 'state', label: 'Registered state' },
      { name: 'stateCode', label: 'State code (GST)', hint: 'Maharashtra is 27.' },
      { name: 'address', label: 'Address', type: 'textarea' },
      { name: 'phone', label: 'Phone' },
      { name: 'email', label: 'Email' },
      { name: 'whatsapp', label: 'Default WhatsApp number' },
      { name: 'mapUrl', label: 'Map link' },
      { name: 'invoicePrefix', label: 'Invoice prefix' },
    ],
  },
  {
    key: 'payments',
    title: 'Payment methods',
    fields: [
      { name: 'onlineEnabled', label: 'Online payment (UPI, cards, net banking, wallets)', type: 'switch' },
      { name: 'codEnabled', label: 'Cash on delivery', type: 'switch' },
      { name: 'codMaxPaise', label: 'Highest order value for cash on delivery', type: 'money' },
      { name: 'codForPriceOnRequest', label: 'Allow COD on price-on-request pieces', type: 'switch' },
    ],
  },
  {
    key: 'delivery',
    title: 'Delivery charges',
    fields: [
      { name: 'chargePaise', label: 'Delivery charge (incl. GST)', type: 'money' },
      { name: 'freeAbovePaise', label: 'Free delivery at or above', type: 'money', hint: 'Leave empty to always charge.' },
      { name: 'promise', label: 'Delivery promise shown on product pages' },
    ],
  },
  { key: 'returns', title: 'Returns', fields: [{ name: 'windowDays', label: 'Return window (days after delivery)', type: 'number' }, { name: 'customizedReturnable', label: 'Customized pieces can be returned', type: 'switch' }] },
  {
    key: 'referral',
    title: 'Referral rewards',
    fields: [
      { name: 'enabled', label: 'Referral programme on', type: 'switch' },
      { name: 'referrerRewardPaise', label: 'Reward for the referrer', type: 'money' },
      { name: 'refereeRewardPaise', label: 'Reward for the new buyer', type: 'money' },
      { name: 'rewardValidDays', label: 'Reward coupon valid for (days)', type: 'number' },
    ],
  },
  {
    key: 'loyalty',
    title: 'Credit points',
    fields: [
      { name: 'enabled', label: 'Give credit points', type: 'switch' },
      { name: 'earnPercent', label: 'Earn (% of the order, on delivery)', type: 'number', hint: '1 point = ₹1. E.g. 2 means a ₹10,000 order earns 200 points.' },
      { name: 'maxRedeemPercent', label: 'Points may pay at most (% of the order)', type: 'number' },
    ],
  },
  {
    key: 'stock_alert',
    title: 'Low-stock alerts & auto purchase orders',
    fields: [
      { name: 'enabled', label: 'Send low-stock alerts', type: 'switch' },
      { name: 'defaultThreshold', label: 'Alert when stock falls to', type: 'number', hint: 'For pieces sold by quantity; a piece can have its own level.' },
      { name: 'alertEmail', label: 'Also email', hint: 'E.g. the purchase team. Head office, the vendor and the manufacturers always get it.' },
      { name: 'autoPoBelow', label: 'Raise a draft purchase order below', type: 'number', hint: 'When stock falls below this many, a draft PO is raised automatically with the first manufacturer and head office is emailed. 0 switches it off.' },
    ],
  },
  { key: 'cart_reminder', title: 'Abandoned cart reminder', fields: [{ name: 'enabled', label: 'Send reminders', type: 'switch' }, { name: 'delayMinutes', label: 'Send after (minutes)', type: 'number' }] },
  { key: 'review_request', title: 'Review requests', fields: [{ name: 'enabled', label: 'Ask for reviews after delivery', type: 'switch' }, { name: 'delayDays', label: 'Days after delivery', type: 'number' }] },
  { key: 'delivery_proof', title: 'Proof of delivery', fields: [{ name: 'otpAbovePaise', label: 'Require customer OTP for orders at or above', type: 'money' }] },
  { key: 'enquiry', title: 'Enquiries', fields: [{ name: 'acknowledgeAutomatically', label: 'Acknowledge new enquiries automatically', type: 'switch' }, { name: 'responseTargetMinutes', label: 'Response target (minutes)', type: 'number' }] },
  {
    key: 'storefront',
    title: 'Website extras',
    fields: [
      { name: 'announcement', label: 'Announcement bar', type: 'textarea', hint: 'One message per line; they rotate. Leave empty to use the delivery and returns settings.' },
      { name: 'indiaOnly', label: 'Show the store only in India', type: 'switch', hint: 'Visitors outside India see a short notice instead of the store. The admin stays reachable everywhere.' },
      { name: 'giftWrapEnabled', label: 'Offer free gift packing at checkout', type: 'switch' },
      { name: 'deliveryMinDays', label: 'Delivery estimate: fastest (working days)', type: 'number' },
      { name: 'deliveryMaxDays', label: 'Delivery estimate: slowest (working days)', type: 'number' },
      { name: 'consultationsEnabled', label: 'Accept video call and store visit bookings', type: 'switch' },
    ],
  },
  { key: 'app_links', title: 'App store links (website footer)', fields: [{ name: 'android', label: 'Google Play link' }, { name: 'ios', label: 'App Store link' }] },
  { key: 'seo', title: 'Search engines', fields: [{ name: 'titleSuffix', label: 'Title suffix' }, { name: 'defaultDescription', label: 'Default description', type: 'textarea' }] },
];

/** The settings pages, each with its own groups — delivery gets a section of its own (client doc, 26 Oct). */
const SECTIONS: Array<{ id: string; label: string; keys: string[] }> = [
  { id: 'business', label: 'Business & payments', keys: ['store', 'payments'] },
  { id: 'delivery', label: 'Delivery', keys: ['delivery', 'delivery_proof'] },
  { id: 'stock', label: 'Stock & purchase orders', keys: ['stock_alert'] },
  { id: 'marketing', label: 'Rewards & reminders', keys: ['loyalty', 'referral', 'cart_reminder', 'review_request'] },
  { id: 'service', label: 'Enquiries & returns', keys: ['enquiry', 'returns'] },
  { id: 'website', label: 'Website', keys: ['storefront', 'app_links', 'seo'] },
];

function Group({ g, initial }: { g: (typeof GROUPS)[number]; initial: Record<string, unknown> }) {
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const toast = useToast();
  const qc = useQueryClient();
  const can = useCan();
  useEffect(() => setV(initial), [initial]);
  const save = useMutation({
    mutationFn: () => api(`/admin/settings/${g.key}`, { method: 'PATCH', json: v }),
    onSuccess: async () => { setErrors({}); await qc.invalidateQueries({ queryKey: ['/admin/settings'] }); toast(`${g.title} saved`); },
    onError: (e) => { toast(errorText(e), 'danger'); if (e instanceof ApiError && e.fields) setErrors(e.fields); },
  });
  return (
    <Card>
      <form onSubmit={(e) => (e.preventDefault(), save.mutate())} className="grid gap-4 md:grid-cols-2">
        <h2 className="font-semibold md:col-span-2">{g.title}</h2>
        {g.fields.map((f) => (
          <div key={f.name} className={f.type === 'textarea' ? 'md:col-span-2' : undefined}>
            <FieldInput def={f} value={v[f.name]} onChange={(x) => setV((s) => ({ ...s, [f.name]: x }))} error={errors[f.name]} />
          </div>
        ))}
        {can('SETTINGS', 'edit') && <div className="md:col-span-2"><Button type="submit" size="sm" loading={save.isPending}>Save</Button></div>}
      </form>
    </Card>
  );
}

export default function SettingsPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ['/admin/settings'], queryFn: () => api<Record<string, { value: Record<string, unknown> }>>('/admin/settings') });
  const flags = useQuery({ queryKey: ['/admin/feature-flags'], queryFn: () => api<Array<{ key: string; enabled: boolean; description: string | null }>>('/admin/feature-flags') });
  const { data: me } = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const setFlag = useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) => api(`/admin/feature-flags/${key}`, { method: 'PATCH', json: { enabled } }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['/admin/feature-flags'] }); toast('Feature updated'); },
    onError: (e) => toast(errorText(e), 'danger'),
  });
  if (isLoading) return <Spinner />;
  if (error) return <Alert tone="danger">{errorText(error)}</Alert>;
  return (
    <div className="max-w-4xl">
      <PageHeader title="Settings" description="Business settings take effect immediately. Every change is recorded in the audit log." />
      <nav aria-label="Settings sections" className="sticky top-0 z-10 mb-4 flex flex-wrap gap-1.5 border-b border-line bg-bg/95 py-2 backdrop-blur">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="rounded-sm border border-line bg-surface px-2.5 py-1 text-xs font-medium hover:border-ink">
            {s.label}
          </a>
        ))}
      </nav>
      <div className="flex flex-col gap-4">
        {SECTIONS.map((s) => (
          <section key={s.id} id={s.id} className="flex scroll-mt-16 flex-col gap-4">
            <h2 className="mt-2 text-xs font-semibold tracking-wide text-muted uppercase">{s.label}</h2>
            {s.keys.map((k) => {
              const g = GROUPS.find((x) => x.key === k)!;
              return <Group key={g.key} g={g} initial={data?.[g.key]?.value ?? {}} />;
            })}
          </section>
        ))}
        <Card>
          <h2 className="mb-1 font-semibold">Features switched on later</h2>
          <p className="mb-3 text-sm text-muted">These are built into the system and stay off until you are ready. Only a Super Admin can change them.</p>
          <ul className="flex flex-col gap-1">
            {flags.data?.map((f) => (
              <li key={f.key} className="flex items-center justify-between gap-3 border-t border-line py-1">
                <Switch checked={f.enabled} disabled={me?.role !== 'SUPER_ADMIN'} onChange={(enabled) => setFlag.mutate({ key: f.key, enabled })} label={f.description ?? f.key} />
                <Badge tone={f.enabled ? 'success' : 'neutral'}>{f.enabled ? 'On' : 'Off'}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
