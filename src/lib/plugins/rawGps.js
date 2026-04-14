// $lib/plugins/rawGps.js
// JS wrapper for the native RawGps Capacitor plugin.
// Provides raw GNSS chip access on Android (LocationManager.GPS_PROVIDER)
// and direct CLLocationManager on iOS — bypassing FLP caching entirely.
import { registerPlugin } from '@capacitor/core';

const RawGps = registerPlugin('RawGps');

export default RawGps;
