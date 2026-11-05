const KEY = 'classpulse.deviceId';

export interface GeoPoint {
  lat: number;
  lng: number;
  accuracyM?: number;
}

export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

/** Resolves undefined instead of failing: denied/slow location must not block check-in (the server decides). */
export function getLocation(timeoutMs = 4000): Promise<GeoPoint | undefined> {
  if (!('geolocation' in navigator)) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: Math.round(p.coords.accuracy) }),
      () => resolve(undefined),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}

export const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
