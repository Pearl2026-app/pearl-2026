'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Field, Input, Spinner, Switch, Textarea } from '@sahyadri/ui';
import { PageHeader } from '@/components/shell';
import { useToast } from '@/components/toast';
import { api, ApiError, errorText } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { useCan } from '@/lib/session';

export default function PageEditor() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const can = useCan();
  const { data: page, isLoading } = useQuery({ queryKey: ['/admin/pages', id], queryFn: () => api<any>(`/admin/pages/${id}`), enabled: !isNew });
  const [v, setV] = useState({ slug: '', title: '', body: '', isLegal: false, seoTitle: '', seoDescription: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ version: number; body: string } | null>(null);

  useEffect(() => {
    if (page) setV({ slug: page.slug, title: page.title, body: page.currentVersion?.body ?? '', isLegal: page.isLegal, seoTitle: page.seoTitle ?? '', seoDescription: page.seoDescription ?? '' });
  }, [page]);

  const save = useMutation({
    mutationFn: () =>
      isNew
        ? api<any>('/admin/pages', { method: 'POST', json: { ...v, seoTitle: v.seoTitle || null, seoDescription: v.seoDescription || null } })
        : api<any>(`/admin/pages/${id}`, { method: 'PATCH', json: { title: v.title, body: v.body, seoTitle: v.seoTitle || null, seoDescription: v.seoDescription || null } }),
    onSuccess: async (saved) => {
      setErrors({});
      setErr(null);
      await qc.invalidateQueries({ queryKey: ['/admin/pages'] });
      toast('Published');
      if (isNew) router.replace(`/pages/${saved.id}`);
    },
    onError: (e) => {
      setErr(errorText(e));
      if (e instanceof ApiError && e.fields) setErrors(e.fields);
    },
  });

  if (!isNew && isLoading) return <Spinner />;
  const editable = can('CONTENT', isNew ? 'create' : 'edit');
  return (
    <div className="max-w-5xl">
      <PageHeader title={isNew ? 'New page' : v.title} description={<Link href="/pages" className="text-accent hover:underline">← Pages</Link>} />
      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        <Card>
          <form className="flex flex-col gap-4" onSubmit={(e) => (e.preventDefault(), save.mutate())}>
            {err && <Alert tone="danger">{err}</Alert>}
            <Field label="Title" error={errors.title} required>{(fid) => <Input id={fid} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />}</Field>
            {isNew && (
              <>
                <Field label="URL" error={errors.slug} hint="e.g. terms or our-story" required>{(fid) => <Input id={fid} value={v.slug} onChange={(e) => setV({ ...v, slug: e.target.value })} />}</Field>
                <Switch checked={v.isLegal} onChange={(isLegal) => setV({ ...v, isLegal })} label="Legal page" />
              </>
            )}
            <Field label="Text" error={errors.body} hint="Markdown: ## heading, **bold**, - list items, [link](url)." required>
              {(fid) => <Textarea id={fid} rows={22} className="font-mono text-sm" value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} />}
            </Field>
            <Field label="SEO title (optional)">{(fid) => <Input id={fid} value={v.seoTitle} onChange={(e) => setV({ ...v, seoTitle: e.target.value })} />}</Field>
            <Field label="SEO description (optional)">{(fid) => <Textarea id={fid} value={v.seoDescription} onChange={(e) => setV({ ...v, seoDescription: e.target.value })} />}</Field>
            {editable && <div><Button type="submit" loading={save.isPending}>{isNew ? 'Create and publish' : 'Publish new version'}</Button></div>}
          </form>
        </Card>
        {!isNew && page && (
          <Card>
            <h2 className="mb-2 font-semibold">Version history</h2>
            <ul className="flex flex-col gap-2 text-sm">
              {page.versions.map((ver: any) => (
                <li key={ver.id} className="flex flex-col">
                  <span>
                    v{ver.version} {ver.id === page.currentVersionId && <strong>(live)</strong>}
                  </span>
                  <span className="text-xs text-muted">{dateTime(ver.publishedAt)}</span>
                  <span className="flex gap-3 text-xs">
                    <button className="text-accent underline" onClick={async () => setViewing(await api(`/admin/pages/${id}/versions/${ver.id}`))}>View</button>
                    {ver.id !== page.currentVersionId && editable && (
                      <button className="text-accent underline" onClick={async () => { try { await api(`/admin/pages/${id}/versions/${ver.id}/restore`, { method: 'POST' }); await qc.invalidateQueries({ queryKey: ['/admin/pages'] }); toast('Restored as a new version'); } catch (e) { toast(errorText(e), 'danger'); } }}>
                        Restore
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
      {viewing && (
        <Card className="mt-4">
          <div className="mb-2 flex justify-between"><h2 className="font-semibold">Version {viewing.version}</h2><button className="text-sm underline" onClick={() => setViewing(null)}>Close</button></div>
          <pre className="text-sm whitespace-pre-wrap">{viewing.body}</pre>
        </Card>
      )}
    </div>
  );
}
