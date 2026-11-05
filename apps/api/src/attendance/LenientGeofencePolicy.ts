import { type CheckInContext, pass, type RuleResult } from './CheckInRule.js';
import { GeoMath } from './GeoMath.js';
import type { GeofencePolicy } from './GeofencePolicy.js';

export class LenientGeofencePolicy implements GeofencePolicy {
  async check(ctx: CheckInContext): Promise<RuleResult> {
    const { location, geofenceRadiusM } = ctx.session;
    if (!location) return pass();
    if (!ctx.location) return { kind: 'warn', code: 'GEO_UNKNOWN' };
    const { inside, distanceM } = GeoMath.isInside(location, geofenceRadiusM, ctx.location);
    return inside ? pass({ distanceM }) : { kind: 'warn', code: 'GEO_OUTSIDE', data: { distanceM } };
  }
}
