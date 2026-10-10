'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MODULE_LABEL, MODULES, PASSWORD_ROLES, ROLE_LABEL, type Module, type Role } from '@sahyadri/shared';
import { Alert, Button, Card, Spinner } from '@sahyadri/ui';
import { FieldInput, type FieldDef } from '@/components/fields';
import { PageHeader } from '@/components/shell';
import { useToast } from '@/components/toast';
import { api, ApiError, errorText } from '@/lib/api';

type Grant = { module: Module; canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean };
const ACTIONS = [['canView', 'View'], ['canCreate', 'Create'], ['canEdit', 'Edit'], ['canDelete', 'Delete']] as const;

const FIELDS: FieldDef[] = [
  { name: 'role', label: 'Role', type: 'select', only: 'create', required: true, options: (['SUPER_ADMIN', 'STAFF', 'CITY_MANAGER', 'VENDOR', 'FRANCHISE', 'DELIVERY_PARTNER'] as Role[]).map((r) => ({ value: r, label: ROLE_LABEL[r] })) },
  { name: 'name', label: 'Name', required: true },
  { name: 'email', label: 'Email', hint: 'Team roles sign in with email, password and a one-time code.' },
  { name: 'phone', label: 'Mobile number', hint: 'Used for one-time codes. Partners can sign in with it.' },
  { name: 'password', label: 'Password', only: 'create', showIf: (v) => PASSWORD_ROLES.includes(v.role as Role), hint: 'At least 10 characters.' },
  { name: 'cityId', label: 'City', type: 'ref', ref: { path: '/admin/cities' }, showIf: (v) => v.role === 'CITY_MANAGER' },
  { name: 'vendorId', label: 'Vendor', type: 'ref', ref: { path: '/admin/vendors' }, showIf: (v) => v.role === 'VENDOR' },
  { name: 'franchiseId', label: 'Franchise', type: 'ref', ref: { path: '/admin/franchises' }, showIf: (v) => v.role === 'FRANCHISE' },
  { name: 'deliveryPartnerId', label: 'Delivery partner', type: 'ref', ref: { path: '/admin/delivery-partners' }, showIf: (v) => v.role === 'DELIVERY_PARTNER' },
];

export default function UserPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const { data: u, isLoading } = useQuery({ queryKey: ['/admin/users', id], queryFn: () => api<any>(`/admin/users/${id}`), enabled: !isNew });
  const [values, setValues] = useState<Record<string, unknown>>({ role: 'STAFF' });
  const [grants, setGrants] = useState<Grant[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!u) return;
    setValues({ role: u.role, name: u.name, email: u.email, phone: u.phone, cityId: u.city?.id, vendorId: u.vendor?.id, franchiseId: u.franchise?.id, deliveryPartnerId: u.deliveryPartner?.id });
    setGrants(u.permissions);
  }, [u]);

  const grantFor = (m: Module): Grant => grants.find((g) => g.module === m) ?? { module: m, canView: false, canCreate: false, canEdit: false, canDelete: false };
  const setGrant = (m: Module, k: keyof Omit<Grant, 'module'>, v: boolean) =>
    setGrants((gs) => {
      const g = { ...grantFor(m), [k]: v };
      if (k !== 'canView' && v) g.canView = true;
      return [...gs.filter((x) => x.module !== m), g].filter((x) => x.canView || x.canCreate || x.canEdit || x.canDelete);
    });

  const save = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {};
      for (const f of FIELDS) if ((!f.only || f.only === (isNew ? 'create' : 'edit')) && (!f.showIf || f.showIf(values)) && values[f.name] !== undefined) body[f.name] = values[f.name] || null;
      if (values.role === 'STAFF') body.grants = grants;
      return isNew ? api<any>('/admin/users', { method: 'POST', json: body }) : api<any>(`/admin/users/${id}`, { method: 'PATCH', json: body });
    },
    onSuccess: async (saved) => {
      setErrors({});
      setErr(null);
      await qc.invalidateQueries({ queryKey: ['/admin/users'] });
      toast('Saved');
      if (isNew) router.replace(`/users/${saved.id}`);
    },
    onError: (e) => {
      setErr(errorText(e));
      if (e instanceof ApiError && e.fields) setErrors(e.fields);
    },
  });
  const act = useMutation({
    mutationFn: (path: string) => api(`/admin/users/${id}${path}`, { method: 'POST', json: path === '/password' ? { password: window.prompt('New password (at least 10 characters)') ?? '' } : undefined }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['/admin/users'] });
      toast('Done');
    },
    onError: (e) => toast(errorText(e), 'danger'),
  });

  if (!isNew && isLoading) return <Spinner />;
  return (
    <div className="max-w-4xl">
      <PageHeader
        title={isNew ? 'New login' : u?.name}
        description={<Link href="/users" className="text-accent hover:underline">← Staff & partner logins</Link>}
        actions={
          !isNew && u && (
            <>
              {PASSWORD_ROLES.includes(u.role) && <Button size="sm" variant="secondary" onClick={() => act.mutate('/password')}>Reset password</Button>}
              <Button size="sm" variant={u.isActive ? 'danger' : 'secondary'} onClick={() => act.mutate(u.isActive ? '/deactivate' : '/activate')}>
                {u.isActive ? 'Deactivate' : 'Activate'}
              </Button>
            </>
          )
        }
      />
      <form className="flex flex-col gap-4" onSubmit={(e) => (e.preventDefault(), save.mutate())}>
        {err && <Alert tone="danger">{err}</Alert>}
        <Card className="grid gap-4 md:grid-cols-2">
          {!isNew && <p className="text-sm md:col-span-2">Role: <strong>{ROLE_LABEL[u?.role as Role]}</strong></p>}
          {FIELDS.filter((f) => (!f.only || f.only === (isNew ? 'create' : 'edit')) && (!f.showIf || f.showIf(values))).map((f) => (
            <FieldInput key={f.name} def={f} value={values[f.name]} onChange={(v) => setValues((x) => ({ ...x, [f.name]: v }))} error={errors[f.name]} />
          ))}
        </Card>
        {values.role === 'STAFF' && (
          <Card>
            <h2 className="mb-1 font-semibold">Module permissions</h2>
            <p className="mb-3 text-sm text-muted">Tick what this person may do. Anything not ticked is hidden and refused by the server.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted uppercase">
                  <tr><th className="py-1">Module</th>{ACTIONS.map(([, l]) => <th key={l} className="px-2 py-1 text-center">{l}</th>)}</tr>
                </thead>
                <tbody>
                  {MODULES.map((m) => (
                    <tr key={m} className="border-t border-line">
                      <td className="py-1.5">{MODULE_LABEL[m]}</td>
                      {ACTIONS.map(([k, l]) => (
                        <td key={k} className="px-2 text-center">
                          <input type="checkbox" aria-label={`${l} ${MODULE_LABEL[m]}`} className="h-5 w-5" disabled={m === 'AUDIT_LOG' && k !== 'canView'} checked={grantFor(m)[k]} onChange={(e) => setGrant(m, k, e.target.checked)} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
        <div><Button type="submit" loading={save.isPending}>{isNew ? 'Create login' : 'Save changes'}</Button></div>
      </form>
    </div>
  );
}
