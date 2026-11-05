import type { GeoPoint } from './types.js';

const EARTH_RADIUS_M = 6_371_000;
const MAX_ACCURACY_CREDIT_M = 100;

export class GeoMath {
  static distanceM(a: GeoPoint, b: GeoPoint): number {
    const rad = (d: number) => (d * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat);
    const dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
  }

  /** Indoor GPS is noisy: credit the reported accuracy, capped so a 2 km-accuracy fix can't pass anywhere. */
  static isInside(center: GeoPoint, radiusM: number, p: GeoPoint): { inside: boolean; distanceM: number } {
    const distanceM = Math.round(GeoMath.distanceM(center, p));
    const credit = Math.min(p.accuracyM ?? 0, MAX_ACCURACY_CREDIT_M);
    return { inside: distanceM - credit <= radiusM, distanceM };
  }
}
