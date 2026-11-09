'use client';
// Purchase orders as a to-do list (client meeting, 31 Oct): the manufacturer's "My work" page, and the matching
// panel on head office's dashboard. Each task says what to do next, with the action one tap away where it is safe
// to do from the list (pearls received, the next work stage); the rest open the PO.
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, Spinner } from '@sahyadri/ui';
import { useToast } from '@/components/toast';
import { api, errorText, qs } from '@/lib/api';
import { date, inr } from '@/lib/format';

export interface PoTask {
  id: string;
  number: string;
  status: string;
  stage: string | null;
  nextStage: string | null;
  dueDate: string;
  daysLeft: number;
  quantity: number;
  manufacturer: string;
  piece: string;
  balancePaise: number | null;
}
interface Tasks {
  groups: Record<string, PoTask[]>;
  overdue: PoTask[];
  pipeline: Array<{ stage: string; count: number }>;
}
interface Summary { inProgress: number; completed: { count: number; pieces: number }; amountDuePaise: number; bills: { count: number; amountPaise: number; mismatches: number }; awaitingBill: number; paidPaise?: number; outstandingPaise?: number }

const KEY = ['/admin/purchase-orders'];

/** Work completed, the amount due on it and bills uploaded — the manufacturer's earnings at a glance. */
export function PoEarnings({ manufacturerId, mine }: { manufacturerId?: string; mine: boolean }) {
  const { data } = useQuery({ queryKey: [...KEY, 'summary', manufacturerId ?? ''], queryFn: () => api<Summary>(`/admin/purchase-orders/summary${qs({ manufacturerId })}`) });
  if (!data) return null;
  const tile = (label: string, value: string, hint: string) => (
    <Card className="p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-xs text-muted">{hint}</p>
    </Card>
  );
  return (
    <div className="mb-4">
      <h2 className="mb-2 text-sm font-semibold">{mine ? 'Your earnings' : 'Manufacturer earnings'}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {tile('Work completed', String(data.completed.count), `${data.completed.pieces} pieces ready or picked up`)}
        {tile('Amount due', inr(data.amountDuePaise, false), 'Making charge + GST on completed work')}
        {tile('Bills uploaded', String(data.bills.count), `${inr(data.bills.amountPaise, false)}${data.bills.mismatches ? ` · ${data.bills.mismatches} not matching` : ''}`)}
        {tile('Paid', inr(data.paidPaise ?? 0, false), `${inr(data.outstandingPaise ?? 0, false)} still to pay on completed work`)}
        {tile('In progress', String(data.inProgress), data.awaitingBill ? `${data.awaitingBill} completed without a bill` : 'POs being worked on')}
      </div>
    </div>
  );
}

function Due({ t }: { t: PoTask }) {
  if (t.daysLeft < 0) return <Badge tone="danger">{-t.daysLeft} {t.daysLeft === -1 ? 'day' : 'days'} late</Badge>;
  if (t.daysLeft === 0) return <Badge tone="waiting">Due today</Badge>;
  if (t.daysLeft <= 3) return <Badge tone="waiting">Due in {t.daysLeft} {t.daysLeft === 1 ? 'day' : 'days'}</Badge>;
  return <span className="text-xs text-muted">Due {date(t.dueDate)}</span>;
}

/** One PO in a task group: number, piece, due date and the action. */
function Row({ t, action, showMaker }: { t: PoTask; action?: React.ReactNode; showMaker?: boolean }) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line py-3 first:border-t-0">
      <div className="min-w-0 flex-1">
        <Link href={`/purchase-orders/${t.id}`} className="font-medium hover:underline">
          {t.number}
        </Link>
        <span className="ml-2 text-sm text-muted">
          {t.piece}
          {t.quantity > 1 ? ` × ${t.quantity}` : ''}
          {showMaker ? ` · ${t.manufacturer}` : ''}
        </span>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
          {t.stage && <span>Now: {t.stage}</span>}
          <Due t={t} />
          {t.balancePaise != null && t.balancePaise > 0 && <span>Balance {inr(t.balancePaise, false)}</span>}
        </div>
      </div>
      <div className="flex shrink-0 gap-2">{action}</div>
    </li>
  );
}

function Group({ title, hint, items, render, empty }: { title: string; hint: string; items: PoTask[] | undefined; render: (t: PoTask) => React.ReactNode; empty?: string }) {
  if (!items?.length && !empty) return null;
  return (
    <Card className="mb-4">
      <div className="mb-1 flex items-center gap-2">
        <h2 className="font-semibold">{title}</h2>
        {!!items?.length && <Badge tone="info">{items.length}</Badge>}
      </div>
      <p className="mb-2 text-xs text-muted">{hint}</p>
      {items?.length ? <ul>{items.map(render)}</ul> : <p className="text-sm text-muted">{empty}</p>}
    </Card>
  );
}

/** The work stages as a strip with how many pieces sit at each. */
function Pipeline({ pipeline }: { pipeline: Tasks['pipeline'] }) {
  const total = pipeline.reduce((s, p) => s + p.count, 0);
  if (!total) return null;
  return (
    <Card className="mb-4">
      <h2 className="mb-3 font-semibold">Where every piece is</h2>
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-11">
        {pipeline.map((p, i) => (
          <li key={p.stage} className={`rounded-sm border p-2 text-center ${p.count ? 'border-gold bg-bg' : 'border-line'}`}>
            <p className="text-lg font-semibold">{p.count}</p>
            <p className="text-[11px] leading-tight text-muted">
              {i + 1}. {p.stage}
            </p>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function useActions() {
  const qc = useQueryClient();
  const toast = useToast();
  const done = async (msg: string) => {
    await qc.invalidateQueries({ queryKey: KEY });
    toast(msg);
  };
  const pearls = useMutation({
    mutationFn: (id: string) => api(`/admin/purchase-orders/${id}/pearls`, { method: 'POST', json: { step: 'RECEIVED' } }),
    onSuccess: () => done('Pearls received. Now accept the PO with your deadline.'),
    onError: (e) => toast(errorText(e), 'danger'),
  });
  const stage = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) => api(`/admin/purchase-orders/${id}/stage`, { method: 'POST', json: { stage } }),
    onSuccess: (_d, v) => done(`Moved to “${v.stage}”. Head office has been told.`),
    onError: (e) => toast(errorText(e), 'danger'),
  });
  return { pearls, stage };
}

const open = (id: string, label: string, primary = false) => (
  <Link
    href={`/purchase-orders/${id}`}
    className={`inline-flex min-h-9 items-center rounded-sm px-3 text-sm font-medium ${primary ? 'bg-accent text-white' : 'border border-line bg-surface hover:border-ink'}`}
  >
    {label}
  </Link>
);

/** The manufacturer's home: what to do next, in the order it should be done. */
export function MakerWork({ name }: { name: string }) {
  const { data, isLoading } = useQuery({ queryKey: [...KEY, 'tasks'], queryFn: () => api<Tasks>('/admin/purchase-orders/tasks') });
  const { pearls, stage } = useActions();
  const g = data?.groups ?? {};
  const todo = (g.confirmPearls?.length ?? 0) + (g.accept?.length ?? 0) + (g.inWork?.length ?? 0) + (g.uploadBill?.length ?? 0);
  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-semibold">Your work, {name.split(' ')[0]}</h1>
      <p className="mb-5 text-sm text-muted">
        {isLoading ? 'Loading…' : todo ? `${todo} ${todo === 1 ? 'thing needs' : 'things need'} you. Start from the top.` : 'Nothing needs you right now. New purchase orders appear here.'}
      </p>
      {isLoading && <Spinner />}
      {!!data?.overdue.length && (
        <Card className="mb-4 border-danger">
          <h2 className="font-semibold text-danger">Late</h2>
          <p className="mb-2 text-xs text-muted">Past the deadline you accepted. Move the stage on, or tell head office the new date.</p>
          <ul>{data.overdue.map((t) => <Row key={t.id} t={t} action={open(t.id, 'Open')} />)}</ul>
        </Card>
      )}
      <Group
        title="1. Confirm the pearls arrived"
        hint="Head office has sent the pearls for these POs. Check them, then confirm."
        items={g.confirmPearls}
        render={(t) => (
          <Row key={t.id} t={t} action={<Button size="sm" loading={pearls.isPending && pearls.variables === t.id} onClick={() => pearls.mutate(t.id)}>Pearls received</Button>} />
        )}
      />
      <Group
        title="2. Accept with your deadline"
        hint="The pearls are with you. Open the PO, check the specification and CAD, and accept with the date you will finish."
        items={g.accept}
        render={(t) => <Row key={t.id} t={t} action={open(t.id, 'Accept with deadline', true)} />}
      />
      <Group
        title="3. Update the work"
        hint="Tap the next stage when you reach it. Head office is told each time."
        items={g.inWork}
        render={(t) => (
          <Row
            key={t.id}
            t={t}
            action={
              <>
                {t.nextStage && (
                  <Button size="sm" loading={stage.isPending && stage.variables?.id === t.id} onClick={() => stage.mutate({ id: t.id, stage: t.nextStage! })}>
                    Mark: {t.nextStage}
                  </Button>
                )}
                {open(t.id, 'Open')}
              </>
            }
          />
        )}
        empty="No piece in work."
      />
      <Group
        title="4. Upload your bill"
        hint="These pieces are ready. Open the PO and upload the bill with its amount so head office can pay you."
        items={g.uploadBill}
        render={(t) => <Row key={t.id} t={t} action={open(t.id, 'Upload bill', true)} />}
      />
      <Group
        title="Waiting for pearls"
        hint="New POs. Head office will send the pearls; you will see them under step 1."
        items={g.waitingForPearls}
        render={(t) => <Row key={t.id} t={t} action={open(t.id, 'View PO')} />}
      />
      {data && <Pipeline pipeline={data.pipeline} />}
      <PoEarnings mine />
      <p className="text-sm">
        <Link href="/purchase-orders" className="underline">
          All purchase orders
        </Link>
      </p>
    </div>
  );
}

/** Head office: the purchase orders that wait on someone here. */
export function HeadOfficePoTasks() {
  const { data } = useQuery({ queryKey: [...KEY, 'tasks'], queryFn: () => api<Tasks>('/admin/purchase-orders/tasks') });
  if (!data) return null;
  const g = data.groups;
  const rows: Array<[string, string, PoTask[] | undefined, string]> = [
    ['Send to the manufacturer', 'Drafts (including automatic restock POs) not yet sent.', g.send, 'Send'],
    ['Send the pearls', 'Sent POs still waiting for their pearls.', g.sendPearls, 'Mark pearls sent'],
    ['Quality check at pickup', 'Ready at the manufacturer: collect and check.', g.pickup, 'Check'],
    ['Pay the manufacturer', 'Bills uploaded and not fully paid.', g.pay, 'Record payment'],
  ];
  const any = rows.some(([, , items]) => items?.length) || data.overdue.length;
  if (!any) return null;
  return (
    <Card className="mb-5">
      <h2 className="mb-1 flex items-center gap-2 font-semibold">Purchase orders that need you</h2>
      <p className="mb-3 text-xs text-muted">
        {g.waitingForManufacturer?.length ? `${g.waitingForManufacturer.length} waiting for the manufacturer · ` : ''}
        {g.inWork?.length ?? 0} in work
      </p>
      {!!data.overdue.length && (
        <div className="mb-3">
          <p className="text-sm font-semibold text-danger">Late at the manufacturer</p>
          <ul>{data.overdue.map((t) => <Row key={t.id} t={t} showMaker action={open(t.id, 'Open')} />)}</ul>
        </div>
      )}
      {rows.map(([title, hint, items, label]) =>
        items?.length ? (
          <div key={title} className="mb-3">
            <p className="text-sm font-semibold">
              {title} <Badge tone="info">{items.length}</Badge>
            </p>
            <p className="text-xs text-muted">{hint}</p>
            <ul>{items.slice(0, 5).map((t) => <Row key={t.id} t={t} showMaker action={open(t.id, label)} />)}</ul>
            {items.length > 5 && (
              <Link href="/purchase-orders" className="text-xs underline">
                and {items.length - 5} more
              </Link>
            )}
          </div>
        ) : null,
      )}
    </Card>
  );
}
