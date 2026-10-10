'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ENQUIRY_TYPE_LABEL, waMeUrl } from '@sahyadri/shared';
import { Alert, Button, Card, Select, Spinner, StatusBadge, Textarea } from '@sahyadri/ui';
import { PageHeader } from '@/components/shell';
import { useToast } from '@/components/toast';
import { api, errorText } from '@/lib/api';
import { dateTime, inr } from '@/lib/format';
import { useCan, useMe } from '@/lib/session';
import { ConvertEnquiry } from '@/components/convert-enquiry';

const STAGES = ['NEW', 'IN_PROGRESS', 'QUOTED', 'CLOSED'];

export default function EnquiryPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const toast = useToast();
  const can = useCan();
  const { data: me } = useMe();
  const { data: e, isLoading } = useQuery({ queryKey: ['/admin/enquiries', id], queryFn: () => api<any>(`/admin/enquiries/${id}`) });
  const owners = useQuery({ queryKey: ['enquiry-owners'], queryFn: () => api<{ items: Array<{ id: string; name: string }> }>('/admin/enquiries/meta/owners') });
  const franchises = useQuery({ queryKey: ['franchise-options'], queryFn: () => api<{ items: Array<{ id: string; name: string }> }>('/admin/franchises?pageSize=200'), enabled: can('FRANCHISES') });
  const [note, setNote] = useState('');
  const refresh = () => qc.invalidateQueries({ queryKey: ['/admin/enquiries'] });
  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) => api(`/admin/enquiries/${id}`, { method: 'PATCH', json: body }),
    onSuccess: async () => { await refresh(); toast('Saved'); },
    onError: (err) => toast(errorText(err), 'danger'),
  });
  const addNote = useMutation({
    mutationFn: () => api(`/admin/enquiries/${id}/notes`, { method: 'POST', json: { body: note } }),
    onSuccess: async () => { setNote(''); await refresh(); },
    onError: (err) => toast(errorText(err), 'danger'),
  });
  if (isLoading || !e) return <Spinner />;
  const editable = can('ENQUIRIES', 'edit');
  return (
    <div className="max-w-6xl">
      <PageHeader
        title={`${ENQUIRY_TYPE_LABEL[e.type as keyof typeof ENQUIRY_TYPE_LABEL]} enquiry ${e.reference}`}
        description={<span className="flex items-center gap-2"><Link href="/enquiries" className="text-accent hover:underline">← Enquiries</Link><StatusBadge status={e.stage} /> <span className="text-muted">{dateTime(e.createdAt)}</span></span>}
        actions={e.contactPhone && <a href={waMeUrl(e.contactPhone, `Hello ${e.contactName ?? ''}, this is Sahyadri Pearls about your enquiry ${e.reference}.`)} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center rounded-sm bg-whatsapp px-3 text-sm text-white">Reply on WhatsApp</a>}
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4">
          <Card>
            <h2 className="mb-2 font-semibold">Details</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              {e.product && (<><dt className="text-muted">Product</dt><dd>{e.product.name} ({e.product.sku}) · {e.product.priceOnRequest ? 'Price on request' : inr(e.product.pricePaise)}</dd></>)}
              <dt className="text-muted">Customer</dt><dd>{e.contactName ?? e.customer?.user.name ?? '—'} · {e.contactPhone ?? e.customer?.user.phone ?? '—'} {e.contactEmail ? `· ${e.contactEmail}` : ''}</dd>
              <dt className="text-muted">City</dt><dd>{e.city?.name ?? '—'}</dd>
              <dt className="text-muted">Source</dt><dd>{e.source ?? '—'} {e.utm ? <span className="text-xs text-muted">{JSON.stringify(e.utm)}</span> : null}</dd>
              <dt className="text-muted">Page</dt><dd className="break-all">{e.pageUrl ?? '—'}</dd>
              <dt className="text-muted">WhatsApp number</dt><dd>{e.whatsAppNumber ? `${e.whatsAppNumber.label} (${e.whatsAppNumber.phone})` : '—'}</dd>
              {e.payload?.altReference && (<><dt className="text-muted">Also sent as</dt><dd className="font-mono">{e.payload.altReference}</dd></>)}
              {e.message && (<><dt className="text-muted">Message</dt><dd className="whitespace-pre-line">{e.message}</dd></>)}
              <dt className="text-muted">First response</dt><dd>{e.firstResponseAt ? dateTime(e.firstResponseAt) : <span className="text-warning">Waiting</span>}</dd>
            </dl>
          </Card>
          {e.customRequest && (
            <Card>
              <h2 className="mb-2 font-semibold">Customized request</h2>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-muted">Type</dt><dd>{e.customRequest.jewelleryType}</dd>
                <dt className="text-muted">Metal</dt><dd>{e.customRequest.metal ?? '—'}</dd>
                <dt className="text-muted">Size</dt><dd>{e.customRequest.size ?? '—'}</dd>
                <dt className="text-muted">Budget</dt><dd>{inr(e.customRequest.budgetPaise)}</dd>
                <dt className="text-muted">Design notes</dt><dd className="whitespace-pre-line">{e.customRequest.designNotes ?? '—'}</dd>
              </dl>
              <div className="mt-3 flex flex-wrap gap-2">
                {e.customRequest.referenceImageUrls.map((u: string) => <a key={u} href={u} target="_blank" rel="noreferrer"><img src={u} alt="Reference" className="h-24 w-24 rounded-sm object-cover" /></a>)}
              </div>
              <Link href={`/custom-orders/${e.customRequest.id}`} className="mt-3 inline-block text-sm text-accent underline">Open in customized orders</Link>
            </Card>
          )}
          <Card>
            <h2 className="mb-2 font-semibold">Internal notes</h2>
            {e.notes.length === 0 && <p className="text-sm text-muted">No notes yet.</p>}
            <ul className="mb-3 flex flex-col gap-3">
              {e.notes.map((n: any) => (
                <li key={n.id} className="rounded-sm bg-surface-muted p-3 text-sm">
                  <p className="whitespace-pre-line">{n.body}</p>
                  <p className="mt-1 text-xs text-muted">{n.author.name} · {dateTime(n.createdAt)}</p>
                </li>
              ))}
            </ul>
            {editable && (
              <form onSubmit={(ev) => (ev.preventDefault(), note.trim() && addNote.mutate())} className="flex flex-col gap-2">
                <label htmlFor="note" className="text-sm font-medium">Add a note</label>
                <Textarea id="note" rows={3} value={note} onChange={(ev) => setNote(ev.target.value)} />
                <div><Button type="submit" size="sm" loading={addNote.isPending}>Add note</Button></div>
              </form>
            )}
          </Card>
        </div>
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-3">
            <h2 className="font-semibold">Work this enquiry</h2>
            {e.convertedOrder ? (
              <Alert tone="success">Converted to order <Link href={`/orders/${e.convertedOrder.id}`} className="underline">{e.convertedOrder.number}</Link>.</Alert>
            ) : (
              <>
                <label className="text-sm">Stage
                  <Select disabled={!editable} value={e.stage} onChange={(ev) => patch.mutate({ stage: ev.target.value })}>
                    {STAGES.map((s) => <option key={s} value={s}>{s.replace('_', ' ').toLowerCase()}</option>)}
                  </Select>
                </label>
                <label className="text-sm">Owner
                  <Select disabled={!editable} value={e.owner?.id ?? ''} onChange={(ev) => patch.mutate({ ownerId: ev.target.value || null })}>
                    <option value="">Unassigned</option>
                    {owners.data?.items.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </Select>
                </label>
                {me?.role !== 'FRANCHISE' && franchises.data && (
                  <label className="text-sm">Franchise
                    <Select disabled={!editable} value={e.franchise?.id ?? ''} onChange={(ev) => patch.mutate({ franchiseId: ev.target.value || null })}>
                      <option value="">None</option>
                      {franchises.data.items.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </Select>
                  </label>
                )}
                {editable && can('ORDERS', 'create') && e.type !== 'CUSTOMIZED' && <ConvertEnquiry enquiry={e} />}
                {e.customRequest ? (
                  <Link href={`/custom-orders/${e.customRequest.id}`} className="text-sm text-accent underline">Open the customized order</Link>
                ) : (
                  can('CUSTOM_ORDERS', 'create') && <Link href={`/custom-orders/new?enquiryId=${e.id}`} className="text-sm text-accent underline">Start a customized order</Link>
                )}
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
