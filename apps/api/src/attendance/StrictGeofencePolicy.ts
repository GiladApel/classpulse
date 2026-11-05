import { type CheckInContext, pass, reject, type RuleResult } from './CheckInRule.js';
import { GeoMath } from './GeoMath.js';
import type { GeofencePolicy } from './GeofencePolicy.js';

export class StrictGeofencePolicy implements GeofencePolicy {
  async check(ctx: CheckInContext): Promise<RuleResult> {
    const { location, geofenceRadiusM } = ctx.session;
    if (!location) return pass();
    if (!ctx.location) return reject('GEO_UNKNOWN', 'יש לאשר גישה למיקום כדי לסמן נוכחות');
    const { inside, distanceM } = GeoMath.isInside(location, geofenceRadiusM, ctx.location);
    return inside
      ? pass({ distanceM })
      : reject('GEO_OUTSIDE', `נראה שאתם במרחק ${distanceM} מטר מהכיתה`, { distanceM });
  }
}
