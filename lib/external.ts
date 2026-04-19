// lib/external.ts
// WeatherAPI.com + Google Places for fuel stations + geocoding

// ─── Weather (WeatherAPI.com) ─────────────────────────────────────────────────
export interface WeatherData {
  location: string;
  temp_f: number;
  condition: string;
  wind_mph: number;
  visibility_miles: number;
  is_severe: boolean;
  alerts: string[];
  icon: string;
}

export async function getWeather(lat: number, lng: number): Promise<WeatherData> {
  const key = process.env.OPENWEATHER_API_KEY; // paste your WeatherAPI key here
  if (!key) return mockWeather(lat, lng);

  const res = await fetch(
    `https://api.weatherapi.com/v1/current.json?key=${key}&q=${lat},${lng}&aqi=no`,
    { cache: 'no-store' }
  );
  if (!res.ok) return mockWeather(lat, lng);
  const d = await res.json();

  const condition = d.current?.condition?.text || 'Clear';
  const wind_mph  = Math.round(d.current?.wind_mph || 0);
  const vis_miles = Math.round(d.current?.vis_miles || 10);
  const temp_f    = Math.round(d.current?.temp_f || 70);

  const SEVERE = ['Thunderstorm','Tornado','Hurricane','Blizzard','Heavy snow','Sleet','Freezing','Heavy rain','Fog'];
  const isSevere = SEVERE.some(s => condition.toLowerCase().includes(s.toLowerCase()));
  const is_severe = isSevere || wind_mph > 45 || vis_miles < 2;

  return {
    location: d.location?.name || 'Route Location',
    temp_f,
    condition,
    wind_mph,
    visibility_miles: vis_miles,
    is_severe,
    alerts: is_severe ? [`⛈ ${condition} — ${wind_mph}mph winds, ${vis_miles}mi visibility. Use caution.`] : [],
    icon: d.current?.condition?.icon ? `https:${d.current.condition.icon}` : '//cdn.weatherapi.com/weather/64x64/day/116.png',
  };
}

function mockWeather(lat: number, lng: number): WeatherData {
  return { location: 'Route Location', temp_f: 78, condition: 'Clear', wind_mph: 12, visibility_miles: 10, is_severe: false, alerts: [], icon: '//cdn.weatherapi.com/weather/64x64/day/113.png' };
}


// ─── Geocoding ────────────────────────────────────────────────────────────────
export interface LatLng { lat: number; lng: number; }

export async function geocode(address: string): Promise<LatLng | null> {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
  if (!key) return null;
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${key}`;
  const res = await fetch(url);
  const d = await res.json();
  if (d.results?.[0]) {
    const loc = d.results[0].geometry.location;
    return { lat: loc.lat, lng: loc.lng };
  }
  return null;
}

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
  if (!key) return `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${key}`;
  const res = await fetch(url);
  const d = await res.json();
  return d.results?.[0]?.formatted_address || `${lat}, ${lng}`;
}

// ─── Fuel Stations (Google Places) ───────────────────────────────────────────
export interface FuelStation {
  place_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  distance_miles: number;
  rating?: number;
  is_truck_stop: boolean;
  phone?: string;
}

export async function findNearbyFuelStations(lat: number, lng: number, radiusMiles = 10): Promise<FuelStation[]> {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
  if (!key) return mockFuelStations(lat, lng);

  const radiusMeters = radiusMiles * 1609;
  // Search for truck stops and gas stations
  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radiusMeters}&keyword=truck+stop+fuel&key=${key}`;
  const res = await fetch(url);
  const d = await res.json();

  return (d.results || []).slice(0, 5).map((p: any) => {
    const plat = p.geometry.location.lat;
    const plng = p.geometry.location.lng;
    const dist = haversineDistance(lat, lng, plat, plng);
    return {
      place_id: p.place_id,
      name: p.name,
      address: p.vicinity || p.formatted_address || '',
      lat: plat,
      lng: plng,
      distance_miles: +dist.toFixed(1),
      rating: p.rating,
      is_truck_stop: (p.name || '').toLowerCase().includes('pilot') || (p.name || '').toLowerCase().includes('loves') || (p.name || '').toLowerCase().includes('flying j') || (p.name || '').toLowerCase().includes('petro'),
      phone: p.formatted_phone_number,
    };
  }).sort((a: FuelStation, b: FuelStation) => a.distance_miles - b.distance_miles);
}

function mockFuelStations(lat: number, lng: number): FuelStation[] {
  return [
    { place_id: 'mock1', name: 'Pilot Travel Center', address: 'I-10 Exit 162', lat: lat+0.1, lng: lng+0.05, distance_miles: 3.8, rating: 4.2, is_truck_stop: true, phone: '(623) 555-0142' },
    { place_id: 'mock2', name: "Love's Travel Stop", address: 'US-60 Exit 103', lat: lat-0.08, lng: lng+0.12, distance_miles: 6.1, rating: 4.0, is_truck_stop: true, phone: '(623) 555-0188' },
    { place_id: 'mock3', name: 'Flying J Travel Center', address: 'AZ-303 & I-17', lat: lat+0.15, lng: lng-0.06, distance_miles: 9.2, rating: 3.9, is_truck_stop: true, phone: '(602) 555-0167' },
  ];
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8; // Earth radius miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ─── SMS via Twilio ───────────────────────────────────────────────────────────
export async function sendSMS(to: string, message: string): Promise<boolean> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!sid || !token || !from) return false;

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: to, From: from, Body: message }),
  });
  return res.ok;
}
