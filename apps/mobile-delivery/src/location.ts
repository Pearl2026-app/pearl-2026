import * as Location from 'expo-location';

/** One position for the proof of delivery. Never blocks: no permission or no fix means no location. */
export async function currentPosition(): Promise<{ latitude?: string; longitude?: string }> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return {};
    const last = await Location.getLastKnownPositionAsync({ maxAge: 120_000 });
    const p = last ?? (await Promise.race([Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), new Promise<null>((r) => setTimeout(() => r(null), 8000))]));
    return p ? { latitude: p.coords.latitude.toFixed(6), longitude: p.coords.longitude.toFixed(6) } : {};
  } catch {
    return {};
  }
}

/**
 * Live location while the app is open and the rider has jobs (meeting of 19 Oct): sent about every 30 seconds so
 * head office, the vendor and the customer can see where the rider is. Stops when the screen goes away.
 */
export function startLiveLocation(send: (p: { lat: number; lng: number; accuracyM?: number }) => Promise<unknown>): () => void {
  let sub: Location.LocationSubscription | null = null;
  let last = 0;
  let stopped = false;
  void (async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted' || stopped) return;
      sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, timeInterval: 30_000, distanceInterval: 50 }, (p) => {
        if (Date.now() - last < 25_000) return;
        last = Date.now();
        void send({ lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: p.coords.accuracy ?? undefined }).catch(() => undefined);
      });
      if (stopped) sub.remove();
    } catch {
      /* no location: deliveries still work */
    }
  })();
  return () => {
    stopped = true;
    sub?.remove();
  };
}
