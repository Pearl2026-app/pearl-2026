'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Input, Select, Spinner, StatusBadge, Textarea } from '@sahyadri/ui';
import { ImageUpload, useRefOptions } from '@/components/fields';
import { PageHeader } from '@/components/shell';
import { useToast } from '@/components/toast';
import { api, errorText } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { useCan } from '@/lib/session';

type Audience = { type: 'all' } | { type: 'cities'; cityIds: string[] } | { type: 'segment'; segment: string };
interface Form { title: string; body: string; imageUrl: string | null; deepLink: string; audience: Audience }
const EMPTY: Form = { title: '', body: '', imageUrl: null, deepLink: '/offers', audience: { type: 'all' } };

export default function NotificationPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const can = useCan();
  const cities = useRefOptions({ path: '/admin/cities', query: { isActive: 'true' } });
  const segments = useQuery({ queryKey: ['campaign-segments'], queryFn: () => api<{ items: Array<{ value: string; label: string }> }>('/admin/campaigns/meta/segments') });
  const { data: n, isLoading } = useQuery({ queryKey: ['/admin/campaigns', id], queryFn: () => api<any>(`/admin/campaigns/${id}`), enabled: !isNew, refetchInterval: (q) => (q.state.data?.queued ? 3000 : false) });
  const [f, setF] = useState<Form>(EMPTY);
  const [when, setWhen] = useState('');
  useEffect(() => {
    if (n) setF({ title: n.title, body: n.body, imageUrl: n.imageUrl, deepLink: n.deepLink ?? '', audience: n.audience });
  }, [n]);
  const estimate = useQuery({ queryKey: ['campaign-estimate', f.audience], queryFn: () => api<{ customers: number; devices: number }>('/admin/campaigns/estimate', { method: 'POST', json: { audience: f.audience } }), enabled: f.audience.type !== 'cities' || f.audience.cityIds.length > 0 });
  const body = () => ({ title: f.title.trim(), body: f.body.trim(), imageUrl: f.imageUrl, deepLink: f.deepLink.trim() || null, audience: f.audience });
  const save = useMutation({
    mutationFn: () => (isNew ? api<{ id: string }>('/admin/campaigns', { method: 'POST', json: body() }) : api<{ id: string }>(`/admin/campaigns/${id}`, { method: 'PATCH', json: body() })),
    onSuccess: async (r) => {
      await qc.invalidateQueries({ queryKey: ['/admin/campaigns'] });
      toast('Saved');
      if (isNew) router.replace(`/notifications/${r.id}`);
    },
  });
  const act = useMutation({
    mutationFn: ({ path, json }: { path: string; json?: unknown }) => api(`/admin/campaigns/${id}/${path}`, { method: 'POST', json: json ?? {} }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['/admin/campaigns'] });
      toast('Done');
    },
    onError: (e) => toast(errorText(e), 'danger'),
  });
  if (!isNew && (isLoading || !n)) return <Spinner />;
  const editable = isNew ? can('NOTIFICATIONS', 'create') : can('NOTIFICATIONS', 'edit') && ['DRAFT', 'SCHEDULED'].includes(n.status);
  const a = f.audience;

  return (
    <div className="max-w-4xl">
      <PageHeader
        title={isNew ? 'New notification' : n.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Link href="/notifications" className="text-accent hover:underline">← Push notifications</Link>
            {n && <StatusBadge status={n.status} />}
            {n?.scheduledAt && n.status === 'SCHEDULED' && <span>Scheduled for {dateTime(n.scheduledAt)}</span>}
            {n?.sentAt && <span>Sent {dateTime(n.sentAt)} to {n.targetCount} devices · {n.delivered} delivered · {n.failed} failed{n.queued ? ` · ${n.queued} queued` : ''}</span>}
          </span>
        }
      />
      {n && !n.pushReady && <div className="mb-3"><Alert tone="warning">Push sending is not set up yet (Firebase keys are needed), so phones will not receive this.</Alert></div>}
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <Card>
          <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
            {save.error && <Alert tone="danger">{errorText(save.error)}</Alert>}
            <label className="text-sm">Title * <span className="text-muted">({f.title.length}/65)</span><Input required maxLength={65} disabled={!editable} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
            <label className="text-sm">Message * <span className="text-muted">({f.body.length}/240)</span><Textarea required rows={3} maxLength={240} disabled={!editable} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></label>
            <label className="text-sm">Opens (page in the app or site)<Input disabled={!editable} value={f.deepLink} onChange={(e) => setF({ ...f, deepLink: e.target.value })} placeholder="/offers, /collections/bridal, /product/…" /></label>
            <div className="text-sm">Image (optional)<ImageUpload value={f.imageUrl} onChange={(u) => editable && setF({ ...f, imageUrl: u })} folder="notifications" /></div>
            <fieldset className="flex flex-col gap-2 text-sm" disabled={!editable}>
              <legend className="mb-1 font-medium">Send to</legend>
              <Select aria-label="Audience" value={a.type} onChange={(e) => setF({ ...f, audience: e.target.value === 'cities' ? { type: 'cities', cityIds: [] } : e.target.value === 'segment' ? { type: 'segment', segment: segments.data?.items[0]?.value ?? 'repeat_buyers' } : { type: 'all' } })}>
                <option value="all">All customers</option>
                <option value="cities">Customers in chosen cities</option>
                <option value="segment">A customer segment</option>
              </Select>
              {a.type === 'cities' && (
                <div className="flex flex-wrap gap-3">
                  {cities.data?.items.map((c) => (
                    <label key={String(c.id)} className="flex items-center gap-1">
                      <input type="checkbox" checked={a.cityIds.includes(String(c.id))} onChange={(e) => setF({ ...f, audience: { type: 'cities', cityIds: e.target.checked ? [...a.cityIds, String(c.id)] : a.cityIds.filter((x) => x !== c.id) } })} />
                      {String(c.name)}
                    </label>
                  ))}
                </div>
              )}
              {a.type === 'segment' && (
                <Select aria-label="Segment" value={a.segment} onChange={(e) => setF({ ...f, audience: { type: 'segment', segment: e.target.value } })}>
                  {segments.data?.items.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </Select>
              )}
              {estimate.data && <p className="text-muted">Reaches {estimate.data.customers} customers on {estimate.data.devices} devices with the app.</p>}
            </fieldset>
            {editable && <div><Button type="submit" variant={isNew ? 'primary' : 'secondary'} loading={save.isPending}>{isNew ? 'Save draft' : 'Save changes'}</Button></div>}
          </form>
        </Card>
        <div className="flex flex-col gap-4">
          <Card>
            <p className="mb-2 text-xs text-muted uppercase">Preview</p>
            <div className="rounded-lg bg-surface-muted p-3 text-sm">
              <p className="font-semibold">{f.title || 'Title'}</p>
              <p>{f.body || 'Your message'}</p>
              {f.imageUrl && <img src={f.imageUrl} alt="" className="mt-2 rounded-sm" />}
            </div>
          </Card>
          {!isNew && editable && (
            <Card className="flex flex-col gap-2">
              <h2 className="font-semibold">Send</h2>
              <Button loading={act.isPending} onClick={() => window.confirm(`Send “${n.title}” now to ${estimate.data?.devices ?? 'all matching'} devices?`) && act.mutate({ path: 'send' })}>Send now</Button>
              <label className="text-sm">Or schedule (India time)<Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></label>
              <Button variant="secondary" disabled={!when} onClick={() => act.mutate({ path: 'send', json: { at: new Date(when).toISOString() } })}>Schedule</Button>
              <Button variant="ghost" onClick={() => window.confirm('Cancel this notification?') && act.mutate({ path: 'cancel' })}>Cancel notification</Button>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
