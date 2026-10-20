'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ORDER_STATUS_LABEL, type OrderStatus } from '@sahyadri/shared';
import { Alert, Button, Input, Spinner, StatusBadge } from '@sahyadri/ui';
import { addressLine, mapsUrl, OfflineBanner, SignaturePad, signatureBlob, type Job } from '@/components/delivery-bits';
import { useToast } from '@/components/toast';
import { api, errorText } from '@/lib/api';
import { inr, toRupees } from '@/lib/format';
import { submitStep, type QueuedStep } from '@/lib/offline-queue';

/** Location is taken while the rider is on the delivery screen, so submitting never waits for GPS. */
function useLocation(active: boolean) {
  const [loc, setLoc] = useState<{ latitude?: string; longitude?: string }>({});
  useEffect(() => {
    if (!active || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setLoc({ latitude: p.coords.latitude.toFixed(6), longitude: p.coords.longitude.toFixed(6) }),
      () => undefined,
      { timeout: 10_000, maximumAge: 60_000 },
    );
  }, [active]);
  return loc;
}

export default function DeliveryJobPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const qc = useQueryClient();
  const toast = useToast();
  const { data: j, isLoading } = useQuery({ queryKey: ['/delivery/jobs', orderId], queryFn: () => api<Job>(`/delivery/jobs/${orderId}`) });
  const [photo, setPhoto] = useState<File | null>(null);
  const [signed, setSigned] = useState(false);
  const pad = useRef<HTMLCanvasElement>(null);
  const [otp, setOtp] = useState('');
  const [cash, setCash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanCode, setScanCode] = useState('');
  const [scanned, setScanned] = useState<Record<string, number>>({});
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [queuedNote, setQueuedNote] = useState<string | null>(null);

  const step = useMutation({
    networkMode: 'always', // offline steps go to the device queue instead of waiting in memory
    mutationFn: async (s: Omit<QueuedStep, 'id' | 'queuedAt' | 'orderId'>) => submitStep({ ...s, orderId }),
    onSuccess: async (r) => {
      setError(null);
      if (r === 'queued') setQueuedNote('Saved on this phone. It will be sent when you are back online.');
      else toast('Updated');
      await qc.invalidateQueries({ queryKey: ['/delivery/jobs'] });
      await qc.invalidateQueries({ queryKey: ['delivery-queue'] });
    },
    onError: (e) => setError(errorText(e)),
  });
  const resend = useMutation({
    mutationFn: () => api(`/delivery/jobs/${orderId}/otp`, { method: 'POST', json: {} }),
    onSuccess: () => toast('Code sent to the customer'),
    onError: (e) => setError(errorText(e)),
  });

  const loc = useLocation(j?.status === 'OUT_FOR_DELIVERY');
  if (isLoading || !j) return <Spinner />;
  const a = j.addressSnapshot;
  const fail = (action: 'failed' | 'returned') => {
    const reason = window.prompt(action === 'failed' ? 'Why could it not be delivered?' : 'Why is it being returned?');
    if (reason && reason.trim().length >= 3) step.mutate({ action, fields: { reason: reason.trim() } });
  };
  const canFinish = !!photo && (j.otpRequired ? otp.length === 6 : otp.length === 6 || signed) && (j.codDuePaise === 0 || cash);

  return (
    <div className="mx-auto max-w-xl pb-10">
      <Link href="/delivery" className="text-sm text-accent">← My deliveries</Link>
      <div className="my-2 flex items-center justify-between">
        <h1 className="font-serif text-2xl">{j.number}</h1>
        <StatusBadge status={j.status} label={ORDER_STATUS_LABEL[j.status as OrderStatus]} />
      </div>
      <OfflineBanner />
      {queuedNote && <div className="mb-3"><Alert tone="info">{queuedNote}</Alert></div>}
      {error && <div className="mb-3"><Alert tone="danger">{error}</Alert></div>}

      <section className="mb-3 rounded-sm border border-line bg-surface p-3">
        <p className="font-semibold">{j.contactName}</p>
        <p className="text-sm">{addressLine(a)}</p>
        {j.customerNote && <p className="mt-1 text-sm text-muted">Note: {j.customerNote}</p>}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <a href={`tel:${j.contactPhone}`} className="flex min-h-12 items-center justify-center rounded-sm border border-line text-sm font-medium">Call customer</a>
          <a href={mapsUrl(a)} target="_blank" rel="noreferrer" className="flex min-h-12 items-center justify-center rounded-sm border border-line text-sm font-medium">Open in Maps</a>
        </div>
      </section>

      <section className="mb-3 rounded-sm border border-line bg-surface p-3 text-sm">
        <ul>{j.items.map((i) => <li key={i.sku}>{i.quantity} × {i.name} <span className="text-muted">({i.sku})</span></li>)}</ul>
        <p className="mt-2">{j.codDuePaise > 0 ? <strong className="text-warning">Collect cash {inr(j.codDuePaise)}</strong> : 'Already paid; collect nothing.'}</p>
      </section>

      {j.status === 'ASSIGNED' && (
        <section className="mb-3 flex flex-col gap-3 rounded-sm border border-line bg-surface p-3">
          <p className="text-sm font-medium">Scan each piece before pickup</p>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const sku = scanCode.trim().toUpperCase();
              const item = j.items.find((i) => i.sku.toUpperCase() === sku);
              if (!item) setScanMsg(`${sku || 'That code'} is not in this order.`);
              else {
                setScanned((m) => ({ ...m, [item.sku]: Math.min(item.quantity, (m[item.sku] ?? 0) + 1) }));
                setScanMsg(null);
              }
              setScanCode('');
            }}
          >
            <Input aria-label="Scan or type the SKU" placeholder="Scan or type the SKU" value={scanCode} onChange={(e) => setScanCode(e.target.value)} />
            <Button type="submit" variant="secondary">OK</Button>
          </form>
          {scanMsg && <p className="text-sm text-danger">{scanMsg}</p>}
          <ul className="text-sm">
            {j.items.map((i) => {
              const ok = (scanned[i.sku] ?? 0) >= i.quantity;
              return (
                <li key={i.sku} className={ok ? 'text-success' : 'text-muted'}>
                  {ok ? '✓' : '○'} {i.name} · {i.sku} ({scanned[i.sku] ?? 0}/{i.quantity})
                </li>
              );
            })}
          </ul>
          <Button
            className="w-full"
            size="lg"
            disabled={!j.items.every((i) => (scanned[i.sku] ?? 0) >= i.quantity)}
            loading={step.isPending}
            onClick={() => step.mutate({ action: 'picked-up', fields: {} })}
          >
            Picked up from the store
          </Button>
        </section>
      )}
      {j.status === 'PICKED_UP' && <Button className="w-full" size="lg" loading={step.isPending} onClick={() => step.mutate({ action: 'out-for-delivery', fields: {} })}>Start delivery</Button>}

      {j.status === 'OUT_FOR_DELIVERY' && (
        <form
          className="flex flex-col gap-4 rounded-sm border border-line bg-surface p-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const files: Record<string, Blob> = { photo: photo! };
            const signature = signed ? await signatureBlob(pad.current) : null;
            if (signature) files.signature = signature;
            step.mutate({ action: 'delivered', fields: { ...(otp ? { otp } : {}), ...(j.codDuePaise ? { codCollectedPaise: String(j.codDuePaise) } : {}), ...loc }, files });
          }}
        >
          <h2 className="font-semibold">Proof of delivery</h2>
          <label className="text-sm">
            Photo of the handover (required)
            <input type="file" accept="image/*" capture="environment" className="mt-1 block w-full text-sm" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
          </label>
          {photo && <img src={URL.createObjectURL(photo)} alt="Handover photo preview" className="max-h-48 rounded-sm object-contain" />}
          <div>
            <label className="text-sm" htmlFor="otp">Customer’s delivery code {j.otpRequired ? '(required for this order)' : ''}</label>
            <div className="mt-1 flex gap-2">
              <Input id="otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} />
              <Button type="button" variant="secondary" onClick={() => resend.mutate()} loading={resend.isPending}>Send code</Button>
            </div>
          </div>
          {!j.otpRequired && (
            <div>
              <p className="mb-1 text-sm">Or the customer’s signature</p>
              <SignaturePad canvasRef={pad} onSigned={setSigned} />
            </div>
          )}
          {j.codDuePaise > 0 && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-5 w-5" checked={cash} onChange={(e) => setCash(e.target.checked)} />
              I have collected ₹{toRupees(j.codDuePaise)} in cash
            </label>
          )}
          <Button type="submit" size="lg" disabled={!canFinish} loading={step.isPending}>Mark delivered</Button>
        </form>
      )}

      {(j.status === 'PICKED_UP' || j.status === 'OUT_FOR_DELIVERY') && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => fail('failed')}>Could not deliver</Button>
          <Button variant="secondary" onClick={() => fail('returned')}>Return to store</Button>
        </div>
      )}
      {j.delivery?.failureReason && <p className="mt-3 text-sm text-muted">Reason recorded: {j.delivery.failureReason}</p>}
      {j.status === 'DELIVERED' && <Alert tone="success">Delivered{j.delivery?.codCollectedPaise ? ` · cash ${inr(j.delivery.codCollectedPaise)} collected` : ''}.</Alert>}
    </div>
  );
}
