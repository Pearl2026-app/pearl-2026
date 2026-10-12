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
