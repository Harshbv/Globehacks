'use client';
import { useState, useEffect, useRef, Suspense, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';

declare global { interface Window { google: any; __driverMapCb: () => void; } }

interface DriverData {
  driver_id: number;
  basic_info: { driver_first_name: string; driver_last_name: string; work_status: string; driver_phone_number?: string; };
  driver_location?: { last_known_location: string; latest_update: number; };
  loads?: { driver_current_load?: { origin: string; destination: string; revenue?: number; }; };
  enriched: { hos_remaining: number; fuel_level_pct: number; speed_mph: number; cost_per_mile: number; safety_score: number; oor_miles: number; lat: number; lng: number; efficiency_pct: number; };
}

interface DriverMsg {
  id: string; from: 'dispatch' | 'groq'; text: string; time: string; type?: 'alert' | 'coaching' | 'sos' | 'assignment';
}

interface PendingAssignment {
  id: string;
  driver_name: string;
  driver_id: number;
  pickup: string;
  delivery: string;
  miles: number;
  hours: number;
  revenue: number;
  weight?: string;
  timestamp: number;
}

const DEMO_DRIVERS: DriverData[] = [
  { driver_id: 1001, basic_info: { driver_first_name: 'Marcus', driver_last_name: 'Johnson', work_status: 'IN_TRANSIT', driver_phone_number: '602-555-0101' }, driver_location: { last_known_location: 'I-17 N, Cordes Junction AZ', latest_update: Date.now() - 20000 }, loads: { driver_current_load: { origin: 'Phoenix, AZ', destination: 'Albuquerque, NM', revenue: 2800 } }, enriched: { hos_remaining: 9.5, fuel_level_pct: 68, speed_mph: 62, cost_per_mile: 2.31, safety_score: 88, oor_miles: 12.5, lat: 34.1, lng: -112.3, efficiency_pct: 97 } },
  { driver_id: 1002, basic_info: { driver_first_name: 'Sarah', driver_last_name: 'Chen', work_status: 'IN_TRANSIT', driver_phone_number: '602-555-0102' }, driver_location: { last_known_location: 'US-60 E, Wickenburg AZ', latest_update: Date.now() - 300000 }, loads: { driver_current_load: { origin: 'Tucson, AZ', destination: 'Flagstaff, AZ', revenue: 1200 } }, enriched: { hos_remaining: 7.2, fuel_level_pct: 41, speed_mph: 58, cost_per_mile: 2.14, safety_score: 94, oor_miles: 4.2, lat: 33.97, lng: -112.73, efficiency_pct: 99 } },
  { driver_id: 1003, basic_info: { driver_first_name: 'James', driver_last_name: 'Rivera', work_status: 'IN_TRANSIT', driver_phone_number: '602-555-0103' }, driver_location: { last_known_location: 'I-10 E, Benson AZ', latest_update: Date.now() - 600000 }, loads: { driver_current_load: { origin: 'Phoenix, AZ', destination: 'El Paso, TX', revenue: 3200 } }, enriched: { hos_remaining: 11.0, fuel_level_pct: 22, speed_mph: 65, cost_per_mile: 1.87, safety_score: 91, oor_miles: 8.1, lat: 31.96, lng: -110.29, efficiency_pct: 98 } },
  { driver_id: 1004, basic_info: { driver_first_name: 'Amy', driver_last_name: 'Patel', work_status: 'IN_TRANSIT', driver_phone_number: '602-555-0104' }, driver_location: { last_known_location: 'AZ-89, Congress AZ', latest_update: Date.now() - 75000 }, loads: { driver_current_load: { origin: 'Kingman, AZ', destination: 'Phoenix, AZ', revenue: 980 } }, enriched: { hos_remaining: 2.1, fuel_level_pct: 55, speed_mph: 0, cost_per_mile: 2.67, safety_score: 76, oor_miles: 31.4, lat: 34.17, lng: -112.85, efficiency_pct: 88 } },
  { driver_id: 1005, basic_info: { driver_first_name: 'Derek', driver_last_name: 'Williams', work_status: 'AVAILABLE', driver_phone_number: '602-555-0105' }, driver_location: { last_known_location: 'Pilot Travel Center, Flagstaff AZ', latest_update: Date.now() - 3600000 }, loads: {}, enriched: { hos_remaining: 0.8, fuel_level_pct: 78, speed_mph: 0, cost_per_mile: 2.94, safety_score: 65, oor_miles: 0, lat: 35.19, lng: -111.65, efficiency_pct: 82 } },
  { driver_id: 1006, basic_info: { driver_first_name: 'Linda', driver_last_name: 'Torres', work_status: 'IN_TRANSIT', driver_phone_number: '602-555-0106' }, driver_location: { last_known_location: 'I-19 N, Sahuarita AZ', latest_update: Date.now() - 30000 }, loads: { driver_current_load: { origin: 'Nogales, AZ', destination: 'Phoenix, AZ', revenue: 1500 } }, enriched: { hos_remaining: 8.3, fuel_level_pct: 61, speed_mph: 61, cost_per_mile: 2.22, safety_score: 89, oor_miles: 6.8, lat: 31.95, lng: -110.98, efficiency_pct: 95 } },
  { driver_id: 1007, basic_info: { driver_first_name: 'Kevin', driver_last_name: 'Park', work_status: 'AVAILABLE', driver_phone_number: '602-555-0107' }, driver_location: { last_known_location: 'Phoenix Sky Harbor AZ', latest_update: Date.now() - 7200000 }, loads: {}, enriched: { hos_remaining: 10.0, fuel_level_pct: 88, speed_mph: 0, cost_per_mile: 2.05, safety_score: 96, oor_miles: 0, lat: 33.44, lng: -112.01, efficiency_pct: 100 } },
];

const FUEL_STOPS = [
  { name: 'Pilot Travel Center', location: 'I-10 Exit 162, Benson AZ', lat: 31.96, lng: -110.35, distance: '3.8mi', phone: '(520) 586-3240' },
  { name: "Love's Travel Stop", location: 'US-60 Exit 103, Wickenburg AZ', lat: 33.97, lng: -112.80, distance: '6.2mi', phone: '(928) 684-5112' },
  { name: 'Flying J Travel Center', location: 'I-17 Exit 268, Flagstaff AZ', lat: 35.19, lng: -111.70, distance: '4.1mi', phone: '(928) 526-2660' },
];

const REST_AREAS = [
  { name: 'Cordes Junction Rest Area', location: 'I-17 MM 262, AZ', lat: 34.18, lng: -112.10 },
  { name: 'Picacho Peak Rest Area', location: 'I-10 MM 219, AZ', lat: 32.63, lng: -111.40 },
  { name: 'Tonopah Rest Area', location: 'I-10 MM 106, AZ', lat: 33.50, lng: -113.02 },
];

// ─── localStorage key for pending assignments ───────────────────────────────
const ASSIGN_KEY = (driverName: string) => `dispatchiq_assignment_${driverName.toLowerCase().replace(/\s+/g, '_')}`;
const DECLINE_KEY = (assignId: string) => `dispatchiq_decline_${assignId}`;
const ACCEPT_KEY = (assignId: string) => `dispatchiq_accept_${assignId}`;

// ─── Driver Map ──────────────────────────────────────────────────────────────
function DriverMap({ driver }: { driver: DriverData }) {
  const mapDiv = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
    if (!key || key === 'your_google_maps_key') return;
    if (window.google) { setLive(true); return; }
    if (window.__driverMapCb) { return; } // already loading
    window.__driverMapCb = () => setLive(true);
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&callback=__driverMapCb`;
    document.head.appendChild(s);
  }, []);

  useEffect(() => {
    if (!live || !mapDiv.current || !window.google) return;
    const map = new window.google.maps.Map(mapDiv.current, {
      center: { lat: driver.enriched.lat, lng: driver.enriched.lng },
      zoom: 9,
      styles: [
        { elementType: 'geometry', stylers: [{ color: '#f8fafc' }] },
        { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#e2e8f0' }] },
        { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#bfdbfe' }] },
        { featureType: 'poi', stylers: [{ visibility: 'off' }] },
      ],
    });
    const driverSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44"><circle cx="22" cy="22" r="21" fill="#0D1B2A" opacity="0.15"/><circle cx="22" cy="22" r="14" fill="#F59E0B"/><text x="22" y="26" text-anchor="middle" fill="white" font-size="11" font-weight="800" font-family="sans-serif">🚛</text></svg>`;
    new window.google.maps.Marker({ position: { lat: driver.enriched.lat, lng: driver.enriched.lng }, map, icon: { url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(driverSvg)}`, scaledSize: new window.google.maps.Size(44, 44) }, zIndex: 1000 });
    const load = driver.loads?.driver_current_load;
    if (load) {
      const destLat = driver.enriched.lat + (Math.random() - 0.5) * 3;
      const destLng = driver.enriched.lng + (Math.random() - 0.5) * 3;
      const destSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40"><path d="M16 0 C7.2 0 0 7.2 0 16 C0 28 16 40 16 40 C16 40 32 28 32 16 C32 7.2 24.8 0 16 0Z" fill="#059669"/><text x="16" y="21" text-anchor="middle" fill="white" font-size="13">📦</text></svg>`;
      new window.google.maps.Marker({ position: { lat: destLat, lng: destLng }, map, icon: { url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(destSvg)}`, scaledSize: new window.google.maps.Size(32, 40) } });
      new window.google.maps.Polyline({ path: [{ lat: driver.enriched.lat, lng: driver.enriched.lng }, { lat: destLat, lng: destLng }], geodesic: true, strokeColor: '#F59E0B', strokeOpacity: 0.8, strokeWeight: 3, map });
    }
    FUEL_STOPS.forEach(f => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="13" fill="#F59E0B"/><text x="14" y="18" text-anchor="middle" fill="white" font-size="12">⛽</text></svg>`;
      const mk = new window.google.maps.Marker({ position: { lat: f.lat, lng: f.lng }, map, icon: { url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`, scaledSize: new window.google.maps.Size(28, 28) } });
      const iw = new window.google.maps.InfoWindow({ content: `<div style="font-family:Outfit,sans-serif;padding:8px 10px;"><b>${f.name}</b><br/><span style="font-size:11px;color:#64748B;">${f.location}</span><br/><span style="font-size:11px;color:#F59E0B;">${f.distance} away</span><br/><a href="tel:${f.phone}" style="font-size:11px;color:#059669;">${f.phone}</a></div>` });
      mk.addListener('click', () => iw.open(map, mk));
    });
    REST_AREAS.forEach(r => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="13" fill="#0284C7"/><text x="14" y="18" text-anchor="middle" fill="white" font-size="12">😴</text></svg>`;
      const mk = new window.google.maps.Marker({ position: { lat: r.lat, lng: r.lng }, map, icon: { url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`, scaledSize: new window.google.maps.Size(28, 28) } });
      const iw = new window.google.maps.InfoWindow({ content: `<div style="font-family:Outfit,sans-serif;padding:8px 10px;"><b>${r.name}</b><br/><span style="font-size:11px;color:#64748B;">${r.location}</span><br/><span style="font-size:11px;color:#0284C7;">FMCSA Designated Rest Area</span></div>` });
      mk.addListener('click', () => iw.open(map, mk));
    });
  }, [live, driver]);

  if (!live) {
    return (
      <div style={{ height: '100%', background: '#F1F5F9', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, border: '1px solid #E2E8F0' }}>
        <div style={{ fontSize: 32 }}>🗺</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#64748B' }}>Map View</div>
        <div style={{ fontSize: 11, color: '#94A3B8', textAlign: 'center', maxWidth: 240 }}>Add NEXT_PUBLIC_GOOGLE_MAPS_KEY to .env.local for live route map</div>
        <div style={{ padding: '10px 16px', background: '#fff', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12, color: '#64748B' }}>📍 {driver.driver_location?.last_known_location}</div>
        {driver.loads?.driver_current_load && <div style={{ padding: '8px 16px', background: '#F0FDF4', borderRadius: 8, border: '1px solid #BBF7D0', fontSize: 12, color: '#059669', fontWeight: 600 }}>📦 → {driver.loads.driver_current_load.destination}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          {FUEL_STOPS.slice(0, 2).map(f => <div key={f.name} style={{ padding: '6px 10px', background: 'rgba(245,158,11,.1)', borderRadius: 6, fontSize: 11, color: '#D97706' }}>⛽ {f.name.split(' ')[0]}</div>)}
          <div style={{ padding: '6px 10px', background: 'rgba(2,132,199,.1)', borderRadius: 6, fontSize: 11, color: '#0284C7' }}>😴 Rest Area</div>
        </div>
      </div>
    );
  }
  return <div ref={mapDiv} style={{ width: '100%', height: '100%', borderRadius: 12, overflow: 'hidden' }} />;
}

// ─── Assignment Modal ────────────────────────────────────────────────────────
function AssignmentModal({ assignment, driver, onAccept, onDecline }: {
  assignment: PendingAssignment;
  driver: DriverData;
  onAccept: (plan: string) => void;
  onDecline: (reason: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [declineMode, setDeclineMode] = useState(false);
  const [reason, setReason] = useState('');

  const handleAccept = async () => {
    setLoading(true);
    let plan = '';
    try {
      const res = await fetch('/api/driver-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driver_name: `${driver.basic_info.driver_first_name} ${driver.basic_info.driver_last_name}`,
          situation: `New load assignment accepted: ${assignment.pickup} → ${assignment.delivery}, ${assignment.miles} miles, estimated ${assignment.hours.toFixed(1)} hours`,
          hos_remaining: driver.enriched.hos_remaining,
          fuel_pct: driver.enriched.fuel_level_pct,
          current_location: driver.driver_location?.last_known_location,
          destination: assignment.delivery,
          distance_to_destination: assignment.miles,
          question: `Generate an optimal travel plan for this trip: pickup at ${assignment.pickup}, delivery at ${assignment.delivery}. ${assignment.miles} miles, ~${assignment.hours.toFixed(1)} hours drive time. My HOS: ${driver.enriched.hos_remaining}h, fuel: ${driver.enriched.fuel_level_pct}%. Include fuel stops, rest breaks, estimated ETAs.`,
        }),
      });
      const data = await res.json();
      plan = data.response || data.coaching?.message || '';
    } catch { }

    if (!plan) {
      const hosOk = driver.enriched.hos_remaining >= assignment.hours;
      const fuelStops = assignment.miles > 300 ? Math.ceil(assignment.miles / 400) : 0;
      const restBreaks = assignment.hours > 8 ? 1 : 0;
      plan = `✅ OPTIMAL PLAN — ${assignment.pickup} → ${assignment.delivery}\n\n` +
        `📍 Depart: Now from ${driver.driver_location?.last_known_location}\n` +
        `🛣 Route: ${assignment.miles} miles · ${assignment.hours.toFixed(1)}h drive time\n\n` +
        (fuelStops > 0 ? `⛽ Fuel Stop: ~${Math.round(assignment.miles / 2)} miles in (Pilot/Love's recommended)\n` : '') +
        (restBreaks > 0 ? `😴 Rest Break: 30-min at ~${Math.round(assignment.hours / 2)}h mark\n` : '') +
        `\n⏰ HOS Status: ${hosOk ? `✓ ${driver.enriched.hos_remaining.toFixed(1)}h available — sufficient` : `⚠️ Only ${driver.enriched.hos_remaining.toFixed(1)}h HOS — plan mandatory rest before completion`}\n` +
        `⛽ Fuel: ${driver.enriched.fuel_level_pct}% — ${driver.enriched.fuel_level_pct > 40 ? '✓ sufficient to start' : '⚠️ refuel before departing'}\n` +
        `\n💰 Revenue: $${assignment.revenue.toLocaleString()} · Est. profit after fuel/costs: $${Math.round(assignment.revenue * 0.62).toLocaleString()}`;
    }

    onAccept(plan);
    setLoading(false);
  };

  const handleDecline = () => {
    const msg = reason.trim() || 'Driver unavailable';
    onDecline(msg);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Outfit',sans-serif", padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 480, background: '#162a4a', borderRadius: 16, border: '1px solid rgba(255,255,255,.15)', boxShadow: '0 32px 80px rgba(0,0,0,.6)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', background: 'rgba(245,158,11,.12)', borderBottom: '1px solid rgba(245,158,11,.2)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#F59E0B', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>⚡ New Assignment from Dispatch</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>{assignment.pickup}</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,.5)', margin: '2px 0 4px' }}>↓ to</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>{assignment.delivery}</div>
        </div>

        {/* Route details */}
        <div style={{ padding: '14px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          {[
            { icon: '🛣', label: 'Distance', value: `${assignment.miles} mi` },
            { icon: '⏱', label: 'Drive Time', value: `${assignment.hours.toFixed(1)}h` },
            { icon: '💰', label: 'Revenue', value: `$${assignment.revenue.toLocaleString()}` },
          ].map(x => (
            <div key={x.label} style={{ padding: '10px 12px', background: 'rgba(255,255,255,.06)', borderRadius: 9, textAlign: 'center', border: '1px solid rgba(255,255,255,.08)' }}>
              <div style={{ fontSize: 18, marginBottom: 3 }}>{x.icon}</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', fontFamily: "'JetBrains Mono',monospace" }}>{x.value}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,.4)', marginTop: 2 }}>{x.label}</div>
            </div>
          ))}
        </div>

        {/* HOS / fuel check */}
        <div style={{ padding: '0 20px 14px' }}>
          <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,.04)', borderRadius: 9, border: '1px solid rgba(255,255,255,.07)', fontSize: 12, color: 'rgba(255,255,255,.6)', lineHeight: 1.7 }}>
            <div style={{ color: driver.enriched.hos_remaining >= assignment.hours ? '#059669' : '#F59E0B', fontWeight: 600 }}>
              ⏰ HOS: {driver.enriched.hos_remaining.toFixed(1)}h remaining {driver.enriched.hos_remaining >= assignment.hours ? '✓ sufficient' : '⚠️ may need rest stop'}
            </div>
            <div style={{ color: driver.enriched.fuel_level_pct > 30 ? '#059669' : '#F59E0B', fontWeight: 600 }}>
              ⛽ Fuel: {driver.enriched.fuel_level_pct}% {driver.enriched.fuel_level_pct > 30 ? '✓ sufficient' : '⚠️ refuel recommended'}
            </div>
          </div>
        </div>

        {/* Decline reason input */}
        {declineMode && (
          <div style={{ padding: '0 20px 14px' }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,.5)', marginBottom: 6 }}>Reason for declining (will be sent to dispatch):</div>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Too far from current location, HOS too low..."
              style={{ width: '100%', padding: '10px 12px', background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.15)', borderRadius: 8, color: '#fff', fontSize: 13, outline: 'none', fontFamily: 'inherit', resize: 'none', minHeight: 72 }}
              autoFocus
            />
          </div>
        )}

        {/* Buttons */}
        <div style={{ padding: '0 20px 20px', display: 'flex', gap: 10 }}>
          {!declineMode ? (
            <>
              <button
                onClick={handleAccept}
                disabled={loading}
                style={{ flex: 2, padding: '13px', background: '#059669', border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                {loading ? '⏳ AI Planning Route…' : '✅ Accept & Get AI Plan'}
              </button>
              <button
                onClick={() => setDeclineMode(true)}
                style={{ flex: 1, padding: '13px', background: 'rgba(225,29,72,.12)', border: '1px solid rgba(225,29,72,.3)', borderRadius: 10, color: '#E11D48', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                ✗ Decline
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleDecline}
                style={{ flex: 2, padding: '13px', background: '#E11D48', border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Send Decline to Dispatch
              </button>
              <button
                onClick={() => setDeclineMode(false)}
                style={{ flex: 1, padding: '13px', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 10, color: 'rgba(255,255,255,.5)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Back
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Portal ─────────────────────────────────────────────────────────────
function PortalContent() {
  const params = useSearchParams();
  const nameFromUrl = params.get('name') || '';
  const idFromUrl = params.get('id') || '';

  const [nameInput, setNameInput] = useState(nameFromUrl || '');
  const [driver, setDriver] = useState<DriverData | null>(null);
  const [loginError, setLoginError] = useState('');
  const [msgs, setMsgs] = useState<DriverMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoad, setChatLoad] = useState(false);
  const [clk, setClk] = useState('');
  const [pendingAssignment, setPendingAssignment] = useState<PendingAssignment | null>(null);
  const [acceptedPlan, setAcceptedPlan] = useState<string | null>(null);
  const msgCountRef = useRef(0);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = () => setClk(new Date().toLocaleTimeString('en-US', { hour12: false }));
    t(); const id = setInterval(t, 1000); return () => clearInterval(id);
  }, []);

  // Auto-scroll chat to bottom whenever msgs change
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs, chatLoad]);

  // Auto-login from URL params
  useEffect(() => {
    if (nameFromUrl) attemptLogin(nameFromUrl);
    else if (idFromUrl) {
      const d = DEMO_DRIVERS.find(dr => dr.driver_id === parseInt(idFromUrl));
      if (d) loginDriver(d);
    }
    // eslint-disable-next-line
  }, []);

  // Poll for pending assignments from dispatch (every 5 seconds)
  useEffect(() => {
    if (!driver) return;
    const driverName = `${driver.basic_info.driver_first_name} ${driver.basic_info.driver_last_name}`;
    const poll = () => {
      try {
        const raw = localStorage.getItem(ASSIGN_KEY(driverName));
        if (!raw) return;
        const assignment: PendingAssignment = JSON.parse(raw);
        // Check it's not already handled
        const alreadyAccepted = localStorage.getItem(ACCEPT_KEY(assignment.id));
        const alreadyDeclined = localStorage.getItem(DECLINE_KEY(assignment.id));
        if (!alreadyAccepted && !alreadyDeclined) {
          setPendingAssignment(assignment);
        }
      } catch { }
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, [driver]);

  const attemptLogin = (name: string) => {
    const normalized = name.toLowerCase().trim();
    const found = DEMO_DRIVERS.find(d => {
      const full = `${d.basic_info.driver_first_name} ${d.basic_info.driver_last_name}`.toLowerCase();
      const first = d.basic_info.driver_first_name.toLowerCase();
      return full === normalized || first === normalized || full.includes(normalized) || normalized.includes(first);
    });
    if (found) {
      loginDriver(found);
    } else {
      // Create a generic driver profile for new/unknown drivers
      const parts = name.trim().split(/\s+/);
      const firstName = parts[0] || name;
      const lastName = parts.slice(1).join(' ') || '';
      const newDriver: DriverData = {
        driver_id: Math.floor(Math.random() * 9000 + 2000),
        basic_info: { driver_first_name: firstName, driver_last_name: lastName, work_status: 'AVAILABLE' },
        driver_location: { last_known_location: 'Phoenix, AZ (Check-in)', latest_update: Date.now() },
        loads: {},
        enriched: { hos_remaining: 11.0, fuel_level_pct: 85, speed_mph: 0, cost_per_mile: 2.20, safety_score: 80, oor_miles: 0, lat: 33.4484, lng: -112.074, efficiency_pct: 95 },
      };
      loginDriver(newDriver);
    }
  };

  const loginDriver = (d: DriverData) => {
    setDriver(d);
    setLoginError('');
    msgCountRef.current += 1;
    const initialMsgs: DriverMsg[] = [
      {
        id: `init-${msgCountRef.current}`, from: 'groq', type: 'coaching',
        text: `Hi ${d.basic_info.driver_first_name}! 👋 I'm your DispatchIQ AI Coach. Here's your current status:\n\n⏰ HOS: ${d.enriched.hos_remaining.toFixed(1)}h remaining\n⛽ Fuel: ${d.enriched.fuel_level_pct}%\n🛡 Safety Score: ${d.enriched.safety_score}/100\n💰 Cost/mile: $${d.enriched.cost_per_mile}\n\n${d.enriched.hos_remaining < 2 ? '⚠️ CRITICAL: HOS very low! Plan your rest stop immediately.' : d.enriched.fuel_level_pct < 25 ? '⛽ Low fuel — nearest Pilot Travel Center 3.8mi ahead.' : '✅ You\'re on track! Keep monitoring HOS and fuel.'}`,
        time: new Date().toLocaleTimeString('en-US', { hour12: false }),
      }
    ];
    const elapsed = Date.now() - (d.driver_location?.latest_update || 0);
    if (elapsed > 180000 && d.basic_info.work_status === 'IN_TRANSIT') {
      msgCountRef.current += 1;
      initialMsgs.push({
        id: `sos-${msgCountRef.current}`, from: 'dispatch', type: 'sos',
        text: `🚨 SOS ALERT from DispatchIQ: Your GPS signal was lost for ${Math.round(elapsed / 60000)} minute(s). Dispatch has been notified. Please confirm your status by responding here.`,
        time: 'Just now',
      });
    }
    setMsgs(initialMsgs);

    // Proactive monitoring every 30s
    const monitor = setInterval(() => {
      const issues: string[] = [];
      if (d.enriched.hos_remaining < 2) issues.push(`⏰ HOS CRITICAL: Only ${d.enriched.hos_remaining.toFixed(1)}h remaining. You MUST stop and rest. FMCSA fine risk.`);
      if (d.enriched.fuel_level_pct < 20) issues.push(`⛽ LOW FUEL: ${d.enriched.fuel_level_pct}% remaining. Stop at next Pilot/Love's/Flying J.`);
      if (d.enriched.oor_miles > 20) issues.push(`🗺 OFF ROUTE: ${d.enriched.oor_miles}mi out of route detected.`);
      if (d.enriched.speed_mph > 75) issues.push(`🚨 SPEED ALERT: ${d.enriched.speed_mph}mph detected. Slow down — safety score deduction.`);
      if (issues.length > 0) {
        msgCountRef.current += 1;
        setMsgs(p => [...p, {
          id: `monitor-${msgCountRef.current}-${Date.now()}`, from: 'groq', type: 'alert',
          text: `🔔 Proactive Monitor Alert:\n\n${issues.join('\n\n')}\n\nRecommended action: ${issues[0].includes('HOS') ? 'Find the nearest rest area (marked on your map).' : issues[0].includes('fuel') ? 'Head to nearest fuel stop — see map markers.' : 'Follow the planned route.'}`,
          time: new Date().toLocaleTimeString('en-US', { hour12: false }),
        }]);
      }
    }, 30000);
    return () => clearInterval(monitor);
  };

  const handleAcceptAssignment = (plan: string, assignment: PendingAssignment) => {
    const driverName = `${driver!.basic_info.driver_first_name} ${driver!.basic_info.driver_last_name}`;
    // Mark accepted in localStorage so dispatch portal can see it
    localStorage.setItem(ACCEPT_KEY(assignment.id), JSON.stringify({
      driver_name: driverName,
      assignment_id: assignment.id,
      pickup: assignment.pickup,
      delivery: assignment.delivery,
      miles: assignment.miles,
      hours: assignment.hours,
      plan,
      accepted_at: new Date().toISOString(),
    }));
    // Remove the pending assignment
    localStorage.removeItem(ASSIGN_KEY(driverName));
    setPendingAssignment(null);
    setAcceptedPlan(plan);

    // Add acceptance message to chat
    msgCountRef.current += 1;
    setMsgs(p => [...p,
      { id: `accept-${msgCountRef.current}`, from: 'groq', type: 'assignment',
        text: `✅ Assignment ACCEPTED!\n\n📦 ${assignment.pickup} → ${assignment.delivery}\n🛣 ${assignment.miles} miles · ${assignment.hours.toFixed(1)}h drive\n💰 $${assignment.revenue.toLocaleString()} revenue\n\n${plan}`,
        time: new Date().toLocaleTimeString('en-US', { hour12: false }) }
    ]);
  };

  const handleDeclineAssignment = (reason: string, assignment: PendingAssignment) => {
    const driverName = `${driver!.basic_info.driver_first_name} ${driver!.basic_info.driver_last_name}`;
    // Write decline to localStorage for dispatch to read
    localStorage.setItem(DECLINE_KEY(assignment.id), JSON.stringify({
      driver_name: driverName,
      assignment_id: assignment.id,
      pickup: assignment.pickup,
      delivery: assignment.delivery,
      reason,
      declined_at: new Date().toISOString(),
    }));
    localStorage.removeItem(ASSIGN_KEY(driverName));
    setPendingAssignment(null);

    msgCountRef.current += 1;
    setMsgs(p => [...p,
      { id: `decline-${msgCountRef.current}`, from: 'dispatch', type: 'alert',
        text: `❌ Assignment declined and dispatch notified.\n\nRoute: ${assignment.pickup} → ${assignment.delivery}\nReason sent: "${reason}"\n\nDispatch is searching for another driver.`,
        time: new Date().toLocaleTimeString('en-US', { hour12: false }) }
    ]);
  };

  const sendChat = async () => {
    if (!chatInput.trim() || !driver) return;
    const userMsg: DriverMsg = { id: `u-${Date.now()}`, from: 'dispatch', text: chatInput, time: clk };
    setMsgs(p => [...p, userMsg]);
    const q = chatInput;
    setChatInput('');
    setChatLoad(true);

    try {
      const res = await fetch('/api/driver-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driver_name: `${driver.basic_info.driver_first_name} ${driver.basic_info.driver_last_name}`,
          driver_status: { hos_remaining: driver.enriched.hos_remaining, fuel_level_pct: driver.enriched.fuel_level_pct, speed_mph: driver.enriched.speed_mph, cost_per_mile: driver.enriched.cost_per_mile, safety_score: driver.enriched.safety_score, oor_miles: driver.enriched.oor_miles, current_location: driver.driver_location?.last_known_location, destination: driver.loads?.driver_current_load?.destination },
          question: q,
        }),
      });
      const d = await res.json();
      msgCountRef.current += 1;
      setMsgs(p => [...p, { id: `g-${msgCountRef.current}`, from: 'groq', type: 'coaching', text: d.response || d.coaching?.message || d.error || 'No response', time: clk }]);
    } catch {
      msgCountRef.current += 1;
      const suggestions: Record<string, string> = {
        'fuel': `⛽ Fuel guidance: At ${driver.enriched.fuel_level_pct}% remaining, your nearest options are:\n1. Pilot Travel Center — I-10 Exit 162 (3.8mi) · (520) 586-3240\n2. Love's Travel Stop — US-60 Exit 103 (6.2mi)\n\nPro tip: Always refuel above 25% on rural routes.`,
        'hos': `⏰ HOS: ${driver.enriched.hos_remaining.toFixed(1)}h remaining.\n\n${driver.enriched.hos_remaining < 2 ? '🚨 CRITICAL: Stop at the nearest rest area now. Risk of $11,000+ FMCSA fine.' : driver.enriched.hos_remaining < 4 ? '⚠️ Plan your rest stop within 1-2 hours.' : '✅ Good HOS status.'}`,
        'route': `🗺 Route: ${driver.enriched.oor_miles > 0 ? driver.enriched.oor_miles + 'mi off your planned route.' : 'You are on the planned route.'} ${driver.loads?.driver_current_load ? `Heading to ${driver.loads.driver_current_load.destination}.` : 'No active load assigned.'}`,
      };
      const key = Object.keys(suggestions).find(k => q.toLowerCase().includes(k)) || '';
      const defaultResponse = `I'm here to help, ${driver.basic_info.driver_first_name}! Status:\n• HOS: ${driver.enriched.hos_remaining.toFixed(1)}h ✓\n• Fuel: ${driver.enriched.fuel_level_pct}% ${driver.enriched.fuel_level_pct < 25 ? '⚠️ Low' : '✓'}\n• Safety: ${driver.enriched.safety_score}/100\n\nAsk me about: fuel stops, rest areas, HOS rules, or route efficiency.`;
      setMsgs(p => [...p, { id: `g-${msgCountRef.current}`, from: 'groq', type: 'coaching', text: suggestions[key] || defaultResponse, time: clk }]);
    }
    setChatLoad(false);
  };

  // ── Login screen ───────────────────────────────────────────────────────────
  if (!driver) {
    return (
      <div style={{ minHeight: '100vh', background: '#0D1B2A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Outfit',sans-serif" }}>
        <div style={{ width: 420, background: '#162a4a', borderRadius: 16, padding: 40, border: '1px solid rgba(255,255,255,.1)', boxShadow: '0 24px 80px rgba(0,0,0,.5)' }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🚛</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#fff', marginBottom: 6 }}>Driver Portal</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,.45)' }}>DispatchIQ · Trucker Path NavPro</div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Your Name</label>
            <input
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && nameInput && attemptLogin(nameInput)}
              placeholder="e.g. James Rivera or any name"
              style={{ width: '100%', padding: '13px 16px', background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 10, color: '#fff', fontSize: 15, outline: 'none', fontFamily: 'inherit' }}
              autoFocus
            />
            {loginError && <div style={{ marginTop: 8, fontSize: 12, color: '#E11D48', background: 'rgba(225,29,72,.1)', padding: '8px 10px', borderRadius: 6 }}>{loginError}</div>}
          </div>
          <button
            onClick={() => nameInput && attemptLogin(nameInput)}
            style={{ width: '100%', padding: '13px', background: '#F59E0B', border: 'none', borderRadius: 10, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Enter Driver Portal →
          </button>
          <div style={{ marginTop: 20, padding: '12px 14px', background: 'rgba(255,255,255,.04)', borderRadius: 8, fontSize: 11, color: 'rgba(255,255,255,.35)', lineHeight: 1.7 }}>
            <strong style={{ color: 'rgba(255,255,255,.55)' }}>Demo drivers:</strong><br />
            Marcus Johnson · Sarah Chen · James Rivera<br />Amy Patel · Derek Williams · Linda Torres · Kevin Park<br />
            <span style={{ color: 'rgba(255,255,255,.25)' }}>Or enter any name to join as a new driver</span>
          </div>
          <div style={{ marginTop: 12, textAlign: 'center' }}>
            <a href="/" style={{ fontSize: 12, color: 'rgba(255,255,255,.3)', textDecoration: 'none' }}>← Back to Dispatcher View</a>
          </div>
        </div>
      </div>
    );
  }

  const fn = driver.basic_info.driver_first_name;
  const load = driver.loads?.driver_current_load;
  const hos = driver.enriched.hos_remaining;
  const fuel = driver.enriched.fuel_level_pct;
  const hosColor = hos < 2 ? '#E11D48' : hos < 4 ? '#F59E0B' : '#059669';
  const fuelColor = fuel < 20 ? '#E11D48' : fuel < 35 ? '#F59E0B' : '#0284C7';

  return (
    <div style={{ minHeight: '100vh', background: '#0D1B2A', fontFamily: "'Outfit',sans-serif", display: 'flex', flexDirection: 'column' }}>
      {/* Assignment modal */}
      {pendingAssignment && (
        <AssignmentModal
          assignment={pendingAssignment}
          driver={driver}
          onAccept={(plan) => handleAcceptAssignment(plan, pendingAssignment)}
          onDecline={(reason) => handleDeclineAssignment(reason, pendingAssignment)}
        />
      )}

      {/* Header */}
      <header style={{ background: '#162a4a', borderBottom: '1px solid rgba(255,255,255,.08)', padding: '0 20px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="/" style={{ textDecoration: 'none', fontSize: 11, color: 'rgba(255,255,255,.4)', padding: '4px 8px', borderRadius: 5, border: '1px solid rgba(255,255,255,.1)' }}>← Dispatch</a>
          <div style={{ fontWeight: 800, fontSize: 16, color: '#fff' }}>🚛 Driver Portal</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {pendingAssignment && (
            <div style={{ fontSize: 11, fontWeight: 700, color: '#F59E0B', background: 'rgba(245,158,11,.15)', padding: '4px 10px', borderRadius: 20, border: '1px solid rgba(245,158,11,.3)', animation: 'pulse 1.5s infinite' }}>
              ⚡ New Assignment Pending
            </div>
          )}
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#F59E0B', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff' }}>{fn[0]}{driver.basic_info.driver_last_name?.[0] || ''}</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{fn} {driver.basic_info.driver_last_name}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,.4)', fontFamily: "'JetBrains Mono',monospace" }}>{clk} · {driver.basic_info.work_status}</div>
          </div>
        </div>
      </header>

      {/* Accepted plan banner */}
      {acceptedPlan && (
        <div style={{ background: 'rgba(5,150,105,.1)', borderBottom: '1px solid rgba(5,150,105,.2)', padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ fontSize: 12, color: '#059669', fontWeight: 600 }}>✅ Active Assignment — AI plan in your chat below</div>
          <button onClick={() => setAcceptedPlan(null)} style={{ fontSize: 11, color: 'rgba(5,150,105,.6)', background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
        </div>
      )}

      {/* Main layout */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '340px 1fr 320px', gap: 0, overflow: 'hidden', height: acceptedPlan ? 'calc(100vh - 97px)' : 'calc(100vh - 56px)' }}>

        {/* Left — Status panel */}
        <div style={{ background: '#0F2040', borderRight: '1px solid rgba(255,255,255,.06)', overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.35)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>Your Status</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { l: 'HOS Left', v: `${hos.toFixed(1)}h`, c: hosColor, icon: '⏰' },
                { l: 'Fuel', v: `${fuel}%`, c: fuelColor, icon: '⛽' },
                { l: 'Speed', v: driver.enriched.speed_mph > 0 ? `${driver.enriched.speed_mph}mph` : 'Idle', c: '#F59E0B', icon: '🚗' },
                { l: 'Safety', v: `${driver.enriched.safety_score}/100`, c: driver.enriched.safety_score > 80 ? '#059669' : '#F59E0B', icon: '🛡' },
                { l: '$/mile', v: `$${driver.enriched.cost_per_mile}`, c: '#F59E0B', icon: '💰' },
                { l: 'OOR Miles', v: `${driver.enriched.oor_miles}mi`, c: driver.enriched.oor_miles > 20 ? '#E11D48' : '#94A3B8', icon: '🗺' },
              ].map(x => (
                <div key={x.l} style={{ padding: '10px 12px', background: 'rgba(255,255,255,.05)', borderRadius: 9, border: '1px solid rgba(255,255,255,.07)' }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', marginBottom: 3 }}>{x.icon} {x.l}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: x.c, fontFamily: "'JetBrains Mono',monospace" }}>{x.v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* HOS bar */}
          <div style={{ padding: '12px', background: 'rgba(255,255,255,.04)', borderRadius: 9, border: '1px solid rgba(255,255,255,.07)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 6 }}>
              <span style={{ color: 'rgba(255,255,255,.5)' }}>HOS Progress</span>
              <span style={{ color: hosColor, fontWeight: 700 }}>{hos.toFixed(1)}h / 11h</span>
            </div>
            <div style={{ height: 8, background: 'rgba(255,255,255,.08)', borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
              <div style={{ height: '100%', width: `${(hos / 11) * 100}%`, background: hosColor, borderRadius: 4, transition: 'width 1s' }} />
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,.3)', lineHeight: 1.5 }}>
              {hos < 2 ? '🚨 Stop NOW — FMCSA violation risk' : hos < 4 ? '⚠️ Plan rest stop within 1 hour' : `✓ ${hos.toFixed(1)}h until mandatory rest`}
            </div>
          </div>

          {/* Current load */}
          {load && (
            <div style={{ padding: '12px', background: 'rgba(5,150,105,.08)', borderRadius: 9, border: '1px solid rgba(5,150,105,.2)' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#059669', marginBottom: 8 }}>📦 Current Load</div>
              <div style={{ fontSize: 12, color: '#fff', marginBottom: 4 }}>{load.origin}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,.4)', marginBottom: 4 }}>↓</div>
              <div style={{ fontSize: 12, color: '#fff', marginBottom: 6 }}>{load.destination}</div>
              {load.revenue && <div style={{ fontSize: 14, fontWeight: 700, color: '#059669', fontFamily: "'JetBrains Mono',monospace" }}>${load.revenue.toLocaleString()}</div>}
            </div>
          )}

          {/* Accepted AI plan preview */}
          {acceptedPlan && (
            <div style={{ padding: '10px 12px', background: 'rgba(245,158,11,.08)', borderRadius: 9, border: '1px solid rgba(245,158,11,.2)' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#F59E0B', marginBottom: 6 }}>⚡ Active Route Plan</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.55)', lineHeight: 1.6, whiteSpace: 'pre-line', maxHeight: 140, overflow: 'hidden' }}>{acceptedPlan.slice(0, 300)}{acceptedPlan.length > 300 ? '…' : ''}</div>
              <div style={{ fontSize: 10, color: '#F59E0B', marginTop: 6, cursor: 'pointer' }} onClick={() => {
                setMsgs(p => p.find(m => m.id === 'plan-scroll') ? p : [...p, { id: 'plan-scroll', from: 'groq', type: 'assignment', text: acceptedPlan, time: clk }]);
              }}>View full plan in chat →</div>
            </div>
          )}

          {/* Nearest fuel stops */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.35)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>⛽ Nearest Fuel Stops</div>
            {FUEL_STOPS.map(f => (
              <div key={f.name} style={{ padding: '9px 11px', background: 'rgba(245,158,11,.07)', borderRadius: 8, marginBottom: 6, border: '1px solid rgba(245,158,11,.15)' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', marginBottom: 2 }}>{f.name}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', marginBottom: 4 }}>{f.location}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: '#F59E0B', fontWeight: 600 }}>{f.distance}</span>
                  <a href={`tel:${f.phone}`} style={{ fontSize: 11, color: '#059669', textDecoration: 'none' }}>📞 {f.phone}</a>
                </div>
              </div>
            ))}
          </div>

          {/* Rest areas */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.35)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>😴 Rest Areas</div>
            {REST_AREAS.map(r => (
              <div key={r.name} style={{ padding: '8px 11px', background: 'rgba(2,132,199,.07)', borderRadius: 8, marginBottom: 6, border: '1px solid rgba(2,132,199,.15)' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{r.name}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)' }}>{r.location}</div>
              </div>
            ))}
          </div>

          {/* Logout */}
          <button onClick={() => { setDriver(null); setNameInput(''); setMsgs([]); setAcceptedPlan(null); setPendingAssignment(null); }} style={{ width: '100%', padding: '9px', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, color: 'rgba(255,255,255,.4)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}>Sign Out</button>
        </div>

        {/* Center — Map */}
        <div style={{ padding: 16, overflow: 'hidden' }}>
          <div style={{ height: '100%' }}>
            <DriverMap driver={driver} />
          </div>
        </div>

        {/* Right — AI Coach */}
        <div style={{ background: '#0F2040', borderLeft: '1px solid rgba(255,255,255,.06)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,.06)', flexShrink: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>🤖 AI Coach</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,.35)' }}>Powered by Groq · Real-time guidance</div>
          </div>

          {/* Messages — scrollable */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {msgs.map(m => (
              <div key={m.id} style={{
                padding: '10px 12px', borderRadius: 10,
                background: m.type === 'sos' ? 'rgba(225,29,72,.15)' : m.type === 'assignment' ? 'rgba(5,150,105,.1)' : m.type === 'alert' ? 'rgba(245,158,11,.1)' : m.from === 'groq' ? 'rgba(255,255,255,.06)' : 'rgba(245,158,11,.1)',
                border: `1px solid ${m.type === 'sos' ? 'rgba(225,29,72,.3)' : m.type === 'assignment' ? 'rgba(5,150,105,.25)' : m.type === 'alert' ? 'rgba(245,158,11,.2)' : 'rgba(255,255,255,.08)'}`,
                alignSelf: m.from === 'dispatch' && m.type !== 'sos' && m.type !== 'alert' ? 'flex-end' : 'flex-start',
                maxWidth: '95%',
              }}>
                {m.from === 'groq' && (
                  <div style={{ fontSize: 10, fontWeight: 600, color: m.type === 'sos' ? '#E11D48' : m.type === 'assignment' ? '#059669' : m.type === 'alert' ? '#F59E0B' : '#F59E0B', marginBottom: 4 }}>
                    {m.type === 'sos' ? '🚨 DISPATCH SOS' : m.type === 'assignment' ? '✅ ASSIGNMENT PLAN' : m.type === 'alert' ? '⚠️ AI Monitor' : '🤖 AI Coach'}
                  </div>
                )}
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,.85)', lineHeight: 1.6, whiteSpace: 'pre-line' }}>{m.text}</div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,.3)', marginTop: 4, textAlign: 'right', fontFamily: "'JetBrains Mono',monospace" }}>{m.time}</div>
              </div>
            ))}
            {chatLoad && (
              <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)', alignSelf: 'flex-start' }}>
                <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                  {[0, .3, .6].map(d => <div key={d} style={{ width: 6, height: 6, borderRadius: '50%', background: '#F59E0B', animation: `blink 1s infinite ${d}s` }} />)}
                </div>
              </div>
            )}
            {/* Scroll anchor */}
            <div ref={chatEndRef} />
          </div>

          {/* Quick prompts */}
          <div style={{ padding: '8px 12px', borderTop: '1px solid rgba(255,255,255,.06)', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
              {['Nearest fuel stop?', 'HOS status?', 'How to improve score?', 'Rest area nearby?'].map(q => (
                <button key={q} onClick={() => setChatInput(q)} style={{ fontSize: 10, padding: '4px 8px', borderRadius: 5, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', color: 'rgba(255,255,255,.6)', cursor: 'pointer', fontFamily: 'inherit' }}>{q}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); sendChat(); } }}
                placeholder="Ask your AI coach anything…"
                style={{ flex: 1, padding: '9px 11px', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, color: '#fff', fontSize: 12, outline: 'none', fontFamily: 'inherit' }}
              />
              <button onClick={sendChat} disabled={chatLoad} style={{ padding: '9px 13px', background: '#F59E0B', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: chatLoad ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>↑</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DriverPortal() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0D1B2A', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: 'Outfit,sans-serif' }}>Loading Driver Portal…</div>}>
      <PortalContent />
    </Suspense>
  );
}
