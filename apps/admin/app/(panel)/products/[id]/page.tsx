'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Alert, Badge, Button, Card, Spinner, StatusBadge } from '@sahyadri/ui';
import { FieldInput, type FieldDef } from '@/components/fields';
import { PageHeader } from '@/components/shell';
import { useToast } from '@/components/toast';
import { api, ApiError, errorText } from '@/lib/api';
import { date, humanize, inr } from '@/lib/format';
import { useCan, useMe } from '@/lib/session';

interface Img {
  id: string;
  url: string;
  kind: 'MAIN' | 'CAROUSEL' | 'LIFESTYLE';
  alt: string | null;
}
interface Product {
  id: string;
  sku: string;
  name: string;
  slug: string;
  status: string;
  soldAt: string | null;
  stockType: string;
  archivedAt: string | null;
  videoUrl: string | null;
  pendingChanges: Record<string, unknown> | null;
  images: Img[];
  cities: Array<{ city: { id: string; name: string } }>;
  relatedFrom: Array<{ related: { id: string; name: string; sku: string } }>;
  certificates: Array<{ id: string; code: string; issuedAt: string }>;
  [k: string]: unknown;
}

const SECTIONS: Array<{ title: string; fields: FieldDef[] }> = [
  {
    title: 'Basics',
    fields: [
      { name: 'name', label: 'Name', required: true },
      { name: 'sku', label: 'SKU', required: true },
      { name: 'categoryId', label: 'Category', type: 'ref', ref: { path: '/admin/categories' }, required: true },
      { name: 'collectionId', label: 'Collection', type: 'ref', ref: { path: '/admin/collections' } },
      { name: 'farmId', label: 'Origin farm', type: 'ref', ref: { path: '/admin/farms' } },
      { name: 'vendorId', label: 'Vendor', type: 'ref', ref: { path: '/admin/vendors' }, hint: 'Leave empty for own stock.' },
      { name: 'description', label: 'Description', type: 'textarea', wide: true },
    ],
  },
  {
    title: 'Price and costs',
    fields: [
      { name: 'pricePaise', label: 'Price (incl. GST)', type: 'money', required: true },
      { name: 'compareAtPaise', label: 'Was price (optional)', type: 'money' },
      { name: 'priceOnRequest', label: 'Price on request (hide price and Add to Cart)', type: 'switch' },
      { name: 'metalCostPaise', label: 'Metal cost', type: 'money' },
      { name: 'labourCostPaise', label: 'Labour cost', type: 'money' },
      { name: 'pearlCostPaise', label: 'Pearl cost', type: 'money', hint: 'Use the price calculator for a suggestion.' },
    ],
  },
  {
    title: 'Pearl specification',
    fields: [
      { name: 'caratWeight', label: 'Carat weight', type: 'number' },
      { name: 'shape', label: 'Shape', type: 'select', options: ['Round', 'Near-round', 'Button', 'Drop', 'Rice', 'Baroque', 'Oval', 'Coin'].map((v) => ({ value: v, label: v })) },
      { name: 'colour', label: 'Colour', type: 'select', options: ['White', 'Cream', 'Rose', 'Golden', 'Silver', 'Black', 'Lavender', 'Peach'].map((v) => ({ value: v, label: v })) },
      { name: 'lustre', label: 'Lustre', type: 'select', options: ['Excellent', 'High', 'Good', 'Fair'].map((v) => ({ value: v, label: v })) },
      { name: 'surface', label: 'Surface' },
      { name: 'grade', label: 'Grade', type: 'select', options: ['AAA', 'AA+', 'AA', 'A'].map((v) => ({ value: v, label: v })) },
      { name: 'sizeMm', label: 'Size (mm)', type: 'number' },
      { name: 'metal', label: 'Metal / setting' },
      { name: 'certification', label: 'Certification' },
    ],
  },
  {
    title: 'Stock',
    fields: [
      { name: 'stockType', label: 'Stock type', type: 'select', options: [{ value: 'UNIQUE', label: 'Unique piece (sold once)' }, { value: 'QUANTITY', label: 'Quantity stock' }], required: true },
      { name: 'quantity', label: 'Quantity', type: 'number', showIf: (v) => v.stockType === 'QUANTITY' },
      { name: 'outOfStock', label: 'Mark out of stock', type: 'switch' },
      { name: 'isFeatured', label: 'Feature on the home page', type: 'switch' },
      { name: 'sortOrder', label: 'Sort order', type: 'number' },
    ],
  },
  {
    title: 'Where it is sold',
    fields: [
      { name: 'cityIds', label: 'Cities', type: 'refMulti', ref: { path: '/admin/cities' }, hint: 'None selected = every city.', read: (r: Product) => r.cities.map((c) => c.city.id) },
      { name: 'relatedIds', label: 'Related pieces', type: 'refMulti', ref: { path: '/admin/products', label: 'name', query: { status: 'PUBLISHED' } }, read: (r: Product) => r.relatedFrom.map((x) => x.related.id) },
    ],
  },
  {
    title: 'Search engines',
    fields: [
      { name: 'seoTitle', label: 'SEO title (optional)', hint: 'Generated automatically when empty.' },
      { name: 'seoDescription', label: 'SEO description (optional)', type: 'textarea' },
    ],
  },
];
const ALL_FIELDS = SECTIONS.flatMap((s) => s.fields);
const VENDOR_HIDDEN = new Set(['vendorId', 'isFeatured', 'sortOrder']);
const COST_FIELDS = new Set(['metalCostPaise', 'labourCostPaise', 'pearlCostPaise']);

function SortableImage({ img, onMain, onRemove, disabled }: { img: Img; onMain: () => void; onRemove: () => void; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: img.id, disabled });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className="relative rounded-sm border border-line bg-surface p-1">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={img.url} alt={img.alt ?? ''} className="aspect-square w-full cursor-grab rounded-sm object-cover" {...attributes} {...listeners} />
      <div className="mt-1 flex items-center justify-between gap-1 text-xs">
        {img.kind === 'MAIN' ? <Badge tone="success">Main</Badge> : <button className="text-accent underline" onClick={onMain} disabled={disabled}>Make main</button>}
        {!disabled && (
          <button className="text-danger underline" onClick={onRemove}>
            Remove
          </button>
        )}
      </div>
    </li>
  );
}

export default function ProductEditPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const can = useCan();
  const { data: me } = useMe();
  const isVendor = me?.role === 'VENDOR';
  const showCosts = me?.role !== 'FRANCHISE' && me?.role !== 'CITY_MANAGER';
  const editable = can('PRODUCTS', isNew ? 'create' : 'edit') && me?.role !== 'FRANCHISE' && me?.role !== 'CITY_MANAGER';

  const { data: p, isLoading } = useQuery({ queryKey: ['/admin/products', id], queryFn: () => api<Product>(`/admin/products/${id}`), enabled: !isNew });
  const [values, setValues] = useState<Record<string, unknown>>({ stockType: 'UNIQUE', quantity: 1 });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [images, setImages] = useState<Img[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!p) return;
    const v: Record<string, unknown> = {};
    for (const f of ALL_FIELDS) v[f.name] = f.read ? f.read(p) : p[f.name] == null ? p[f.name] : f.type === 'number' ? Number(p[f.name]) : p[f.name];
    setValues(v);
    setImages(p.images);
  }, [p]);

  const refresh = () => qc.invalidateQueries({ queryKey: ['/admin/products'] });
  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {};
      for (const f of ALL_FIELDS) {
        if (isVendor && VENDOR_HIDDEN.has(f.name)) continue;
        if (!showCosts && COST_FIELDS.has(f.name)) continue;
        if (values[f.name] !== undefined) body[f.name] = values[f.name] === '' ? null : values[f.name];
      }
      if (body.stockType === 'UNIQUE') body.quantity = 1;
      return isNew ? api<Product>('/admin/products', { method: 'POST', json: body }) : api<Product>(`/admin/products/${id}`, { method: 'PATCH', json: body });
    },
    onSuccess: async (saved) => {
      setErrors({});
      setFormError(null);
      await refresh();
      toast(isVendor && !isNew && saved.pendingChanges ? 'Changes sent for approval' : 'Product saved');
      if (isNew) router.replace(`/products/${saved.id}`);
    },
    onError: (e) => {
      setFormError(errorText(e));
      if (e instanceof ApiError && e.fields) setErrors(e.fields);
    },
  });
  const action = useMutation({
    mutationFn: ({ path, method = 'POST', json }: { path: string; method?: string; json?: unknown }) => api(`/admin/products/${id}${path}`, { method, json }),
    onSuccess: async () => {
      await refresh();
      toast('Done');
    },
    onError: (e) => toast(errorText(e), 'danger'),
  });

  const upload = async (files: FileList) => {
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append('files', f));
    try {
      await api(`/admin/products/${id}/images`, { method: 'POST', body: fd });
      await refresh();
      toast(`${files.length} image(s) added`);
    } catch (e) {
      toast(errorText(e), 'danger');
    }
  };
  const uploadVideo = async (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    try {
      await api(`/admin/products/${id}/video`, { method: 'POST', body: fd });
      await refresh();
      toast('Video uploaded');
    } catch (e) {
      toast(errorText(e), 'danger');
    }
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const next = arrayMove(images, images.findIndex((i) => i.id === e.active.id), images.findIndex((i) => i.id === e.over!.id));
    setImages(next);
    action.mutate({ path: '/images/order', method: 'PATCH', json: { ids: next.map((i) => i.id) } });
  };

  if (!isNew && isLoading) return <Spinner />;
  if (!isNew && !p) return <Alert tone="danger">Product not found.</Alert>;

  return (
    <div className="max-w-5xl">
      <PageHeader
        title={isNew ? 'New product' : p!.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Link href="/products" className="text-accent hover:underline">← Products</Link>
            {p && (
              <>
                <StatusBadge status={p.status} />
                {p.soldAt && <Badge tone="danger">Sold {date(p.soldAt)}</Badge>}
                {p.status === 'PUBLISHED' && (
                  <a className="text-accent underline" href={`${process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000'}/product/${p.slug}`} target="_blank" rel="noreferrer">
                    View on site
                  </a>
                )}
              </>
            )}
          </span>
        }
        actions={
          p &&
          !isVendor &&
          editable && (
            <>
              {(p.status === 'PENDING_APPROVAL' || p.pendingChanges) && (
                <>
                  <Button size="sm" onClick={() => action.mutate({ path: '/approve' })}>Approve</Button>
                  <Button size="sm" variant="secondary" onClick={() => { const reason = window.prompt('Reason for rejecting?'); if (reason) action.mutate({ path: '/reject', json: { reason } }); }}>
                    Reject
                  </Button>
                </>
              )}
              {p.status !== 'PUBLISHED' && !p.archivedAt && p.status !== 'PENDING_APPROVAL' && <Button size="sm" onClick={() => action.mutate({ path: '/publish' })}>Publish</Button>}
              {p.status === 'PUBLISHED' && <Button size="sm" variant="secondary" onClick={() => action.mutate({ path: '/unpublish' })}>Unpublish</Button>}
              {p.soldAt && <Button size="sm" variant="secondary" onClick={() => window.confirm('Put this piece back on sale?') && action.mutate({ path: '/restock' })}>Restock</Button>}
              {p.archivedAt ? (
                <Button size="sm" variant="secondary" onClick={() => action.mutate({ path: '/restore' })}>Restore</Button>
              ) : (
                can('PRODUCTS', 'delete') && <Button size="sm" variant="danger" onClick={() => window.confirm('Archive this product? It stays in order history.') && action.mutate({ path: '', method: 'DELETE' })}>Archive</Button>
              )}
            </>
          )
        }
      />

      {p?.pendingChanges && (
        <div className="mb-4">
          <Alert tone="warning">
            <strong>Changes waiting for approval:</strong>{' '}
            {Object.entries(p.pendingChanges)
              .map(([k, v]) => `${humanize(k.replace(/Paise$/, ''))}: ${k.endsWith('Paise') ? inr(v as number) : Array.isArray(v) ? `${v.length} selected` : String(v)}`)
              .join(' · ')}
          </Alert>
        </div>
      )}

      <form onSubmit={(e) => (e.preventDefault(), save.mutate())} className="flex flex-col gap-4">
        {formError && <Alert tone="danger">{formError}</Alert>}
        {SECTIONS.map((s) => (
          <Card key={s.title}>
            <h2 className="mb-3 font-semibold">{s.title}</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {s.fields
                .filter((f) => !(isVendor && VENDOR_HIDDEN.has(f.name)) && !(!showCosts && COST_FIELDS.has(f.name)) && (!f.showIf || f.showIf(values)))
                .map((f) => (
                  <div key={f.name} className={f.wide || f.type === 'refMulti' || f.type === 'textarea' ? 'md:col-span-2' : undefined}>
                    <FieldInput def={f} value={values[f.name]} onChange={(v) => setValues((x) => ({ ...x, [f.name]: v }))} error={errors[f.name]} />
                  </div>
                ))}
            </div>
          </Card>
        ))}
        {editable && (
          <div className="sticky bottom-0 flex gap-2 border-t border-line bg-bg/95 py-3 backdrop-blur">
            <Button type="submit" loading={save.isPending}>
              {isNew ? 'Create product' : isVendor && p?.status === 'PUBLISHED' ? 'Send changes for approval' : 'Save changes'}
            </Button>
          </div>
        )}
      </form>

      {p && (
        <>
          <Card className="mt-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Images</h2>
              {editable && (
                <>
                  <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>Add images</Button>
                  <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files?.length && upload(e.target.files)} />
                </>
              )}
            </div>
            <p className="mb-3 text-xs text-muted">Drag to reorder. Images are cropped square and compressed automatically.</p>
            {images.length === 0 ? (
              <p className="text-sm text-muted">No images yet. Add at least one before publishing.</p>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={images.map((i) => i.id)} strategy={rectSortingStrategy}>
                  <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5">
                    {images.map((img) => (
                      <SortableImage
                        key={img.id}
                        img={img}
                        disabled={!editable}
                        onMain={() => action.mutate({ path: `/images/${img.id}`, method: 'PATCH', json: { kind: 'MAIN' } })}
                        onRemove={() => window.confirm('Remove this image?') && action.mutate({ path: `/images/${img.id}`, method: 'DELETE' })}
                      />
                    ))}
                  </ul>
                </SortableContext>
              </DndContext>
            )}
          </Card>

          <Card className="mt-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Video</h2>
              {editable && (
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => videoRef.current?.click()}>{p.videoUrl ? 'Replace video' : 'Upload video'}</Button>
                  {p.videoUrl && <Button size="sm" variant="ghost" onClick={() => action.mutate({ path: '/video', method: 'DELETE' })}>Remove</Button>}
                  <input ref={videoRef} type="file" accept="video/mp4,video/webm,video/quicktime" hidden onChange={(e) => e.target.files?.[0] && uploadVideo(e.target.files[0])} />
                </div>
              )}
            </div>
            {p.videoUrl ? <video src={p.videoUrl} controls className="max-h-64 rounded-sm" /> : <p className="text-sm text-muted">No video.</p>}
          </Card>

          {!isVendor && (
            <Card className="mt-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold">Certificates of authenticity</h2>
                {editable && <Button size="sm" variant="secondary" onClick={async () => { try { await api('/admin/certificates', { method: 'POST', json: { productId: p.id } }); await refresh(); toast('Certificate issued'); } catch (e) { toast(errorText(e), 'danger'); } }}>Issue certificate</Button>}
              </div>
              {p.certificates.length === 0 ? (
                <p className="text-sm text-muted">None issued.</p>
              ) : (
                <ul className="flex flex-col gap-1 text-sm">
                  {p.certificates.map((c) => (
                    <li key={c.id} className="flex items-center gap-3">
                      <span className="font-mono">{c.code}</span>
                      <span className="text-muted">{date(c.issuedAt)}</span>
                      <a className="text-accent underline" href={`/api/v1/admin/certificates/${c.id}/pdf`} target="_blank" rel="noreferrer">PDF with QR</a>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
