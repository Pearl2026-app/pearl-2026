'use client';
import { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, ScanLine } from 'lucide-react';
import { ORDER_STATUS_LABEL, type OrderStatus } from '@sahyadri/shared';
import { Button, Card, Input } from '@sahyadri/ui';

type Detector = { detect: (src: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> };

/**
 * Scan to update (meeting of 19 Oct): every piece carries its SKU as a barcode. Scanning all the pieces of the order
 * (with a USB/Bluetooth scanner, or the phone camera where the browser supports it) moves the order to its next step,
 * e.g. Confirmed → Packed, so the status follows the pieces through the workshop.
 */
export function ScanCard({
  items,
  next,
  onAdvance,
  busy,
}: {
  items: Array<{ sku: string; name: string; quantity: number }>;
  next: OrderStatus | null;
  onAdvance: (to: OrderStatus) => void;
  busy: boolean;
}) {
  const [code, setCode] = useState('');
  const [seen, setSeen] = useState<Record<string, number>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [camera, setCamera] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const canCamera = typeof window !== 'undefined' && 'BarcodeDetector' in window;
  const need = items.filter((i) => i.sku !== 'CUSTOM');
  const done = need.length > 0 && need.every((i) => (seen[i.sku] ?? 0) >= i.quantity);

  const scan = (raw: string) => {
    const sku = raw.trim().toUpperCase();
    if (!sku) return;
    const item = need.find((i) => i.sku.toUpperCase() === sku);
    if (!item) return setMsg({ ok: false, text: `${sku} is not in this order.` });
    const n = Math.min(item.quantity, (seen[item.sku] ?? 0) + 1);
    const nextSeen = { ...seen, [item.sku]: n };
    setSeen(nextSeen);
    setMsg({ ok: true, text: `${item.name} scanned (${n}/${item.quantity}).` });
    if (next && need.every((i) => (nextSeen[i.sku] ?? 0) >= i.quantity)) onAdvance(next);
  };

  useEffect(() => {
    if (!camera || !video.current) return;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    const Ctor = (window as unknown as { BarcodeDetector: new (o?: unknown) => Detector }).BarcodeDetector;
    const detector = new Ctor({ formats: ['code_128', 'code_39', 'ean_13', 'qr_code'] });
    void navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((s) => {
        stream = s;
        video.current!.srcObject = s;
        void video.current!.play();
        timer = setInterval(async () => {
          const r = await detector.detect(video.current!).catch(() => []);
          if (r[0]) {
            scan(r[0].rawValue);
            setCamera(false);
          }
        }, 500);
      })
      .catch(() => {
        setMsg({ ok: false, text: 'The camera could not be opened.' });
        setCamera(false);
      });
    return () => {
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera]);

  if (!need.length) return null;
  return (
    <Card>
      <h2 className="mb-1 flex items-center gap-2 font-semibold">
        <ScanLine size={17} style={{ color: '#9A7546' }} aria-hidden /> Scan to update
      </h2>
      <p className="mb-3 text-sm text-muted">
        {next ? (
          <>
            Scan every piece to mark the order <strong>{ORDER_STATUS_LABEL[next].toLowerCase()}</strong>.
          </>
        ) : (
          'Scan a piece to check it belongs to this order.'
        )}
      </p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          scan(code);
          setCode('');
        }}
      >
        <Input aria-label="Barcode or SKU" placeholder="Scan or type the SKU" value={code} onChange={(e) => setCode(e.target.value)} />
        {canCamera && (
          <Button type="button" variant="secondary" onClick={() => setCamera((c) => !c)} aria-label="Scan with the camera">
            <Camera size={16} />
          </Button>
        )}
      </form>
      {camera && <video ref={video} className="mt-2 aspect-video w-full rounded-sm bg-ink" muted playsInline />}
      <ul className="mt-3 space-y-1 text-sm">
        {need.map((i) => {
          const ok = (seen[i.sku] ?? 0) >= i.quantity;
          return (
            <li key={i.sku} className={`flex items-center gap-2 ${ok ? 'text-success' : 'text-muted'}`}>
              <CheckCircle2 size={15} aria-hidden className={ok ? '' : 'opacity-30'} />
              {i.name} · {i.sku} ({seen[i.sku] ?? 0}/{i.quantity})
            </li>
          );
        })}
      </ul>
      {msg && <p className={`mt-2 text-sm ${msg.ok ? 'text-success' : 'text-danger'}`}>{msg.text}</p>}
      {done && busy && <p className="mt-2 text-sm text-muted">Updating the order…</p>}
    </Card>
  );
}
