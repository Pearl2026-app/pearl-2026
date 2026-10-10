'use client';
import { Suspense } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Select } from '@sahyadri/ui';
import { DataTable, Pagination } from '@/components/data-table';
import { PageHeader } from '@/components/shell';
import { useToast } from '@/components/toast';
import { api, errorText } from '@/lib/api';
import { date } from '@/lib/format';
import { useList, useListParams } from '@/lib/use-list';

function Applications() {
  const { params, set } = useListParams();
  const { data, isLoading } = useList<any>('/admin/job-applications', params);
  const qc = useQueryClient();
  const toast = useToast();
  const openResume = async (id: string) => {
    try {
      const { url } = await api<{ url: string }>(`/admin/job-applications/${id}/resume`);
      window.open(url, '_blank', 'noopener');
    } catch (e) {
      toast(errorText(e), 'danger');
    }
  };
  const setStatus = async (id: string, status: string) => {
    try {
      await api(`/admin/job-applications/${id}`, { method: 'PATCH', json: { status } });
      await qc.invalidateQueries({ queryKey: ['/admin/job-applications'] });
    } catch (e) {
      toast(errorText(e), 'danger');
    }
  };
  return (
    <div>
      <PageHeader title="Job applications" description="Resumes open through a short-lived private link; each view is logged." />
      <DataTable
        rows={data?.items}
        loading={isLoading}
        columns={[
          { key: 'name', label: 'Applicant' },
          { key: 'job', label: 'Opening', render: (r) => `${r.jobOpening.title}, ${r.jobOpening.location}` },
          { key: 'contact', label: 'Contact', render: (r) => <span className="text-xs">{r.email}<br />{r.phone}</span> },
          { key: 'createdAt', label: 'Applied', render: (r) => date(r.createdAt) },
          { key: 'resume', label: 'Resume', render: (r) => <button className="text-accent underline" onClick={() => openResume(r.id)}>Open</button> },
          { key: 'status', label: 'Status', render: (r) => (
            <Select aria-label="Status" value={r.status} onChange={(e) => setStatus(r.id, e.target.value)} className="min-h-9 w-36 py-1">
              {['NEW', 'SHORTLISTED', 'REJECTED', 'HIRED'].map((s) => <option key={s}>{s}</option>)}
            </Select>
          ) },
        ]}
      />
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => set({ page: String(p) })} />}
    </div>
  );
}
export default function ApplicationsPage() { return <Suspense><Applications /></Suspense>; }
