'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Alert, Button } from '@sahyadri/ui';
import { discardQueued, flushQueue, listQueued, type QueuedStep } from '@/lib/offline-queue';

export interface Job {
  id: string;
  number: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  totalPaise: number;
  contactName: string;
  contactPhone: string;
  addressSnapshot: Record<string, string>;
  customerNote: string | null;
  items: Array<{ name: string; sku: string; quantity: number }>;
  delivery: { id: string; status: string; failureReason: string | null; codCollectedPaise: number | null } | null;
  codDuePaise: number;
  otpRequired: boolean;
}

export const addressLine = (a: Record<string, string>) => [a.line1, a.line2, a.landmark, a.area, `${a.cityName} ${a.pincode}`].filter(Boolean).join(', ');
export const mapsUrl = (a: Record<string, string>) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressLine(a))}`;

/** Shows queued steps, sends them when the network returns, and lets the rider drop a refused one. */
export function OfflineBanner() {
  const qc = useQueryClient();
  const [online, setOnline] = useState(true);
  const { data: queued = [], refetch } = useQuery({ queryKey: ['delivery-queue'], queryFn: listQueued, refetchInterval: 15_000 });
  useEffect(() => {
    const sync = async () => {
      setOnline(navigator.onLine);
      if (navigator.onLine && (await flushQueue()) > 0) await qc.invalidateQueries({ queryKey: ['/delivery/jobs'] });
      await refetch();
    };
    void sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    const t = setInterval(sync, 30_000);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
      clearInterval(t);
    };
  }, [qc, refetch]);
  if (online && queued.length === 0) return null;
  return (
    <div className="mb-3 flex flex-col gap-2">
      {!online && <Alert tone="warning">You are offline. Updates are saved on this phone and sent when the connection returns.</Alert>}
      {queued.map((q: QueuedStep) => (
        <div key={q.id} className="flex items-center justify-between gap-2 rounded-sm border border-line bg-surface p-2 text-sm">
          <span>
            {q.action.replace(/-/g, ' ')} · waiting to send
            {q.error && <span className="block text-danger">Not accepted: {q.error}</span>}
          </span>
          {q.error && <Button size="sm" variant="ghost" onClick={async () => { await discardQueued(q.id); await refetch(); }}>Dismiss</Button>}
        </div>
      ))}
    </div>
  );
}

/** Finger signature on a canvas. `signed` reports whether anything was drawn; read the PNG with `signatureBlob` at submit time. */
export function SignaturePad({ canvasRef, onSigned }: { canvasRef: RefObject<HTMLCanvasElement | null>; onSigned: (signed: boolean) => void }) {
  const drawing = useRef(false);
  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * e.currentTarget.width, y: ((e.clientY - r.top) / r.height) * e.currentTarget.height };
  };
  const clear = () => {
    const c = canvasRef.current!;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    onSigned(false);
  };
  return (
    <div>
      <canvas
        ref={canvasRef}
        width={600}
        height={220}
        aria-label="Customer signature"
        className="h-36 w-full touch-none rounded-sm border border-line bg-white"
        onPointerDown={(e) => {
          drawing.current = true;
          const ctx = e.currentTarget.getContext('2d')!;
          const p = pos(e);
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';
          ctx.strokeStyle = '#1f2326';
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = e.currentTarget.getContext('2d')!;
          const p = pos(e);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          onSigned(true);
        }}
        onPointerUp={() => (drawing.current = false)}
        onPointerLeave={() => (drawing.current = false)}
        onPointerCancel={() => (drawing.current = false)}
      />
      <button type="button" className="mt-1 text-sm text-accent underline" onClick={clear}>Clear signature</button>
    </div>
  );
}

export const signatureBlob = (c: HTMLCanvasElement | null): Promise<Blob | null> => new Promise((resolve) => (c ? c.toBlob((b) => resolve(b), 'image/png') : resolve(null)));
