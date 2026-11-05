import type { GeofencePolicy } from './GeofencePolicy.js';
import { LenientGeofencePolicy } from './LenientGeofencePolicy.js';
import { StrictGeofencePolicy } from './StrictGeofencePolicy.js';
import type { GeofenceMode } from './types.js';

export class GeofencePolicyFactory {
  static for(mode: GeofenceMode): GeofencePolicy {
    return mode === 'strict' ? new StrictGeofencePolicy() : new LenientGeofencePolicy();
  }
}
