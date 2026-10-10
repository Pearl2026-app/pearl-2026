'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Alert, Badge, Button, Card } from '@sahyadri/ui';
import { PageHeader } from '@/components/shell';
import { api, errorText } from '@/lib/api';

interface Result {
  dryRun: boolean;
  applied: boolean;
  total: number;
  create: number;
  update: number;
  errors: number;
  results: Array<{ row: number; sku: string; action: string; errors?: string[] }>;
}

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (dryRun: boolean) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      setResult(await api<Result>(`/admin/products/import?dryRun=${dryRun}`, { method: 'POST', body: fd }));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Import products from CSV"
        description={
          <>
            Rows are matched by SKU: new SKUs are created, existing ones updated. Check first, then import.{' '}
            <a className="text-accent underline" href="/api/v1/admin/products/import/template">
              Download the template
            </a>
            .
          </>
        }
      />
      <Card className="flex flex-col gap-4">
        <input type="file" accept=".csv,text/csv" aria-label="CSV file" onChange={(e) => (setFile(e.target.files?.[0] ?? null), setResult(null))} />
        <div className="flex gap-2">
          <Button variant="secondary" disabled={!file} loading={busy} onClick={() => run(true)}>
            Check file
          </Button>
          <Button disabled={!file || !result || result.errors > 0 || result.applied} loading={busy} onClick={() => run(false)}>
            Import {result && !result.applied ? `${result.create + result.update} rows` : ''}
          </Button>
        </div>
        {error && <Alert tone="danger">{error}</Alert>}
        {result && (
          <>
            <Alert tone={result.errors ? 'danger' : result.applied ? 'success' : 'info'}>
              {result.applied
                ? `Imported: ${result.create} created, ${result.update} updated.`
                : `${result.total} rows: ${result.create} new, ${result.update} updates, ${result.errors} with errors.${result.errors ? ' Fix the errors and check again — nothing was imported.' : ''}`}
            </Alert>
            <div className="max-h-96 overflow-auto rounded-sm border border-line">
              <table className="w-full text-sm">
                <thead className="bg-surface-muted text-left text-xs uppercase">
                  <tr>
                    <th className="px-3 py-2">Row</th>
                    <th className="px-3 py-2">SKU</th>
                    <th className="px-3 py-2">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {result.results.map((r) => (
                    <tr key={r.row} className="border-t border-line">
                      <td className="px-3 py-1">{r.row}</td>
                      <td className="px-3 py-1">{r.sku}</td>
                      <td className="px-3 py-1">
                        {r.action === 'error' ? <span className="text-danger">{r.errors?.join('; ')}</span> : <Badge tone={r.action === 'create' ? 'success' : 'info'}>{r.action}</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <Link href="/products" className="text-sm text-accent underline">
          ← Back to products
        </Link>
      </Card>
    </div>
  );
}
