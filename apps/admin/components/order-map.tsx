'use client';
import { MapPin } from 'lucide-react';
import { Card } from '@sahyadri/ui';

export interface MapInfo {
  destination: { lat: number; lng: number } | null;
  store: { lat: number; lng: number; name: string | null } | null;
  rider: { lat: number; lng: number; at: string; name: string | null } | null;
  riderKmAway: number | null;
  storeKmAway: number | null;
}

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};

/**
 * Customer location on a map (meeting of 19 Oct), with the shipping store and, while the delivery is on its way, the
 * rider's last position. OpenStreetMap, so no key is needed; Google Maps opens for directions.
 */
export function OrderMap({ map, address }: { map: MapInfo | undefined; address: string }) {
  if (!map?.destination) return null;
  const pts = [map.destination, map.store, map.rider].filter(Boolean) as Array<{ lat: number; lng: number }>;
  const pad = 0.02;
  const lats = pts.map((p) => p.lat);
  const lngs = pts.map((p) => p.lng);
  const bbox = [Math.min(...lngs) - pad, Math.min(...lats) - pad, Math.max(...lngs) + pad, Math.max(...lats) + pad].join(',');
  const focus = map.rider ?? map.destination;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${focus.lat},${focus.lng}`;
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}${map.rider ? `&origin=${map.rider.lat},${map.rider.lng}` : map.store ? `&origin=${map.store.lat},${map.store.lng}` : ''}`;
  return (
    <Card>
      <h2 className="mb-2 flex items-center gap-2 font-semibold">
        <MapPin size={17} style={{ color: '#0E7C86' }} aria-hidden /> Customer location
      </h2>
      <iframe title="Map of the delivery area" src={src} className="h-56 w-full rounded-sm border border-line" loading="lazy" />
      <ul className="mt-2 space-y-1 text-sm">
        {map.rider ? (
          <li>
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-[#2B5C8A]" /> Rider{map.rider.name ? ` ${map.rider.name}` : ''} is about <strong>{map.riderKmAway} km</strong> away · updated {ago(map.rider.at)}
          </li>
        ) : (
          <li className="text-muted">The rider’s live location shows here once they start the delivery.</li>
        )}
        {map.store && (
          <li className="text-muted">
            Ships from {map.store.name} · about {map.storeKmAway} km from the customer
          </li>
        )}
        <li className="text-xs text-muted">Location is approximate (from the PIN code).</li>
      </ul>
      <a href={directions} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-9 items-center rounded-sm border border-line bg-surface px-3 text-sm hover:border-ink">
        Directions in Google Maps ↗
      </a>
    </Card>
  );
}
