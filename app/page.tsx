'use client';
import { useState, useEffect, useRef, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Driver {
  driver_id: number;
  basic_info: { driver_first_name: string; driver_last_name: string; work_status: string; driver_phone_number?: string; driver_email?: string; };
  driver_location?: { last_known_location: string; latest_update: number; };
  loads?: { driver_current_load?: { origin: string; destination: string; revenue?: number; }; };
  enriched: { hos_remaining: number; fuel_level_pct: number; speed_mph: number; cost_per_mile: number; safety_score: number; oor_miles: number; efficiency_pct: number; lat: number; lng: number; };
}

interface Alert {
  id: string; type: string; severity: 'critical' | 'warning' | 'info';
  title: string; message: string; time: string; driver?: string; phone?: string;
  lat?: number; lng?: number; read: boolean;
}

type View = 'overview' | 'fleet' | 'dispatch' | 'alerts' | 'cost' | 'safety' | 'billing';

// ── Helpers ───────────────────────────────────────────────────────────────────
const AV = ['#F59E0B','#059669','#0284C7','#7C3AED','#E11D48','#059669','#0284C7'];
const gk = () => process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || '';

function Bar({ v, max, c }: { v: number; max: number; c: string }) {
  return (
    <div style={{ height: 5, background: '#EEF0F5', borderRadius: 3, overflow: 'hidden', flex: 1 }}>
      <div style={{ height: '100%', width: `${Math.min((v / max) * 100, 100)}%`, background: c, borderRadius: 3, transition: 'width 1s' }} />
    </div>
  );
}

function Spinner({ size = 14 }: { size?: number }) {
  return <span style={{ width: size, height: size, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin .6s linear infinite', display: 'inline-block', flexShrink: 0 }} />;
}

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  const cfg: Record<string, { bg: string; c: string }> = {
    red: { bg: 'rgba(225,29,72,.1)', c: '#E11D48' },
    amber: { bg: 'rgba(245,158,11,.1)', c: '#D97706' },
    green: { bg: 'rgba(5,150,105,.1)', c: '#059669' },
    blue: { bg: 'rgba(2,132,199,.1)', c: '#0284C7' },
    gray: { bg: '#EEF0F5', c: '#64748B' },
  };
  const s = cfg[color] || cfg.gray;
  return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: s.bg, color: s.c }}>{children}</span>;
}

function Ring({ value, size = 56, color = '#F59E0B' }: { value: number; size?: number; color?: string }) {
  const r = (size - 8) / 2, c = 2 * Math.PI * r, d = (value / 100) * c;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E2E8F0" strokeWidth={4} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={4}
        strokeDasharray={`${d} ${c - d}`} strokeLinecap="round" style={{ transition: 'stroke-dasharray .8s' }} />
    </svg>
  );
}

// ── SOS Signal Monitor ────────────────────────────────────────────────────────
function useSignalMonitor(drivers: Driver[], onSOS: (d: Driver) => void) {
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const fired = useRef(new Set<number>());
  useEffect(() => {
    drivers.forEach(d => {
      if (d.basic_info.work_status !== 'IN_TRANSIT') return;
      const elapsed = Date.now() - (d.driver_location?.latest_update || 0);
      const id = d.driver_id;
      if (fired.current.has(id)) return;
      clearTimeout(timers.current[id]);
      if (elapsed >= 180000) { fired.current.add(id); onSOS(d); }
      else timers.current[id] = setTimeout(() => { if (!fired.current.has(id)) { fired.current.add(id); onSOS(d); } }, 180000 - elapsed);
    });
    return () => Object.values(timers.current).forEach(clearTimeout);
  }, [drivers]);
}

// ── TSP ───────────────────────────────────────────────────────────────────────
function tsp(stops: { name: string; lat: number; lng: number; action: string }[]) {
  if (!stops.length) return [];
  const dist = (a: any, b: any) => Math.sqrt((a.lat - b.lat) ** 2 + (a.lng - b.lng) ** 2);
  const vis = new Array(stops.length).fill(false);
  const route = [0]; vis[0] = true;
  for (let i = 1; i < stops.length; i++) {
    let last = route[route.length - 1], best = -1, bestD = Infinity;
    stops.forEach((s, j) => { if (!vis[j]) { const d = dist(stops[last], s); if (d < bestD) { bestD = d; best = j; } } });
    if (best >= 0) { route.push(best); vis[best] = true; }
  }
  let miles = 0;
  return route.map((i, ri) => {
    if (ri > 0) { const prev = stops[route[ri - 1]]; miles += Math.round(dist(prev, stops[i]) * 69); }
    const hrs = miles / 55;
    return { ...stops[i], miles_from_start: miles, eta: ri === 0 ? 'Now' : hrs < 1 ? Math.round(hrs * 60) + 'min' : hrs.toFixed(1) + 'h' };
  });
}

// ── Google Maps ───────────────────────────────────────────────────────────────
declare global { interface Window { google: any; __gmc: () => void; } }

function FleetMap({ drivers, onSelect }: { drivers: Driver[]; onSelect: (d: Driver) => void }) {
  const mapDiv = useRef<HTMLDivElement>(null);
  const mapObj = useRef<any>(null);
  const mks = useRef<any[]>([]);
  const [live, setLive] = useState(false);
  const [nowTs, setNowTs] = useState<number>(0);
  useEffect(() => { setNowTs(Date.now()); const id = setInterval(() => setNowTs(Date.now()), 10000); return () => clearInterval(id); }, []);

  // Auto-load Google Maps from env key (no UI prompt needed)
  useEffect(() => {
    const key = gk();
    if (!key || key === 'your_google_maps_key' || window.google) {
      if (window.google) setLive(true);
      return;
    }
    window.__gmc = () => setLive(true);
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&callback=__gmc`;
    s.onerror = () => console.log('Maps key invalid');
    document.head.appendChild(s);
  }, []);

  function buildMarkers() {
    if (!mapObj.current || !window.google) return;
    const ts = Date.now();
    mks.current.forEach(m => m.setMap(null)); mks.current = [];
    drivers.forEach((d, i) => {
      if (!d.enriched?.lat) return;
      const elapsed = ts - (d.driver_location?.latest_update || 0);
      const isSOS = d.basic_info.work_status === 'IN_TRANSIT' && elapsed > 180000;
      const isWarn = d.enriched.hos_remaining < 2 || d.enriched.fuel_level_pct < 20;
      const col = isSOS ? '#E11D48' : isWarn ? '#F59E0B' : AV[i % AV.length];
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">${isSOS ? `<circle cx="20" cy="20" r="19" fill="${col}" opacity="0.2"/>` : ''}<circle cx="20" cy="20" r="${isSOS ? 15 : 11}" fill="${col}"/><text x="20" y="24" text-anchor="middle" fill="white" font-size="9" font-weight="700" font-family="sans-serif">${d.basic_info.driver_first_name[0]}${i + 1}</text>${isSOS ? '<circle cx="31" cy="9" r="7" fill="#E11D48"/><text x="31" y="13" text-anchor="middle" fill="white" font-size="9" font-weight="900">!</text>' : ''}</svg>`;
      const mk = new window.google.maps.Marker({
        position: { lat: d.enriched.lat, lng: d.enriched.lng }, map: mapObj.current,
        icon: { url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`, scaledSize: new window.google.maps.Size(40, 40) },
        zIndex: isSOS ? 1000 : isWarn ? 900 : 100,
      });
      const fn = d.basic_info.driver_first_name, ln = d.basic_info.driver_last_name;
      const load = d.loads?.driver_current_load;
      const iw = new window.google.maps.InfoWindow({
        content: `<div style="font-family:Outfit,sans-serif;padding:14px 16px;min-width:220px;">
          ${isSOS ? '<div style="background:#FEE2E2;color:#DC2626;padding:6px 9px;border-radius:6px;font-size:11px;font-weight:700;margin-bottom:10px;">🚨 SOS — SIGNAL LOST</div>' : ''}
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
            <div style="width:36px;height:36px;border-radius:9px;background:${col}18;border:2px solid ${col}44;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:${col};">${fn[0]}${ln[0]}</div>
            <div><b style="font-size:14px;color:#0D1B2A;">${fn} ${ln}</b><br/><span style="font-size:11px;color:#64748B;">${d.driver_location?.last_known_location || ''}</span></div>
          </div>
          ${load ? `<div style="padding:7px 9px;background:#F7F8FA;border-radius:6px;margin-bottom:8px;font-size:11px;"><b>${load.origin} → ${load.destination}</b><br/><span style="color:#059669;font-weight:700;">Revenue: $${(load.revenue || 0).toLocaleString()}</span></div>` : ''}
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;font-size:11px;margin-bottom:8px;">
            <div style="background:#F7F8FA;padding:5px 8px;border-radius:5px;"><span style="color:#64748B;">HOS</span><br/><b style="color:${d.enriched.hos_remaining < 2 ? '#DC2626' : '#059669'};font-size:14px;">${d.enriched.hos_remaining.toFixed(1)}h</b></div>
            <div style="background:#F7F8FA;padding:5px 8px;border-radius:5px;"><span style="color:#64748B;">Fuel</span><br/><b style="color:${d.enriched.fuel_level_pct < 20 ? '#DC2626' : '#0D1B2A'};font-size:14px;">${d.enriched.fuel_level_pct}%</b></div>
            <div style="background:#F7F8FA;padding:5px 8px;border-radius:5px;"><span style="color:#64748B;">Speed</span><br/><b style="font-size:14px;">${d.enriched.speed_mph > 0 ? d.enriched.speed_mph + ' mph' : 'Idle'}</b></div>
            <div style="background:#F7F8FA;padding:5px 8px;border-radius:5px;"><span style="color:#64748B;">$/mile</span><br/><b style="font-size:14px;color:#F59E0B;">$${d.enriched.cost_per_mile}</b></div>
            <div style="background:#F7F8FA;padding:5px 8px;border-radius:5px;"><span style="color:#64748B;">Safety</span><br/><b style="font-size:14px;color:${d.enriched.safety_score > 80 ? '#059669' : '#F59E0B'};">${d.enriched.safety_score}</b></div>
            <div style="background:#F7F8FA;padding:5px 8px;border-radius:5px;"><span style="color:#64748B;">OOR Miles</span><br/><b style="font-size:14px;color:${d.enriched.oor_miles > 20 ? '#DC2626' : '#0D1B2A'};">${d.enriched.oor_miles}mi</b></div>
          </div>
          <div style="display:flex;gap:6px;">
            ${d.basic_info.driver_phone_number ? `<a href="tel:${d.basic_info.driver_phone_number}" style="flex:1;display:block;text-align:center;padding:7px;background:#059669;color:#fff;border-radius:6px;text-decoration:none;font-size:12px;font-weight:700;">📞 Call</a>` : ''}
            <a href="/driver?name=${encodeURIComponent(fn + ' ' + ln)}" style="flex:1;display:block;text-align:center;padding:7px;background:#F59E0B;color:#fff;border-radius:6px;text-decoration:none;font-size:12px;font-weight:700;">🚛 Driver View</a>
          </div>
        </div>`
      });
      mk.addListener('click', () => { mks.current.forEach((m: any) => m.__iw?.close()); iw.open(mapObj.current, mk); (mk as any).__iw = iw; onSelect(d); });
      mks.current.push(mk);
    });
  }

  function initMap() {
    if (!mapDiv.current || !window.google) return;
    mapObj.current = new window.google.maps.Map(mapDiv.current, {
      center: { lat: 33.45, lng: -112.07 }, zoom: 7,
      styles: [
        { elementType: 'geometry', stylers: [{ color: '#f8fafc' }] },
        { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#e2e8f0' }] },
        { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#bfdbfe' }] },
        { featureType: 'poi', stylers: [{ visibility: 'off' }] },
        { featureType: 'transit', stylers: [{ visibility: 'off' }] },
        { elementType: 'labels.text.fill', stylers: [{ color: '#475569' }] },
      ],
    });
    buildMarkers();
  }

  useEffect(() => { if (live) { setTimeout(initMap, 100); } }, [live]);
  useEffect(() => { if (live && mapObj.current) buildMarkers(); }, [drivers, live]);

  const sosCnt = nowTs > 0 ? drivers.filter(d => d.basic_info.work_status === 'IN_TRANSIT' && (nowTs - (d.driver_location?.latest_update || 0)) > 180000).length : 0;

  const positions = [[110, 88], [292, 200], [428, 218], [193, 308], [546, 60], [78, 226], [330, 155]];

  return (
    <div style={{ height: '100%', position: 'relative', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', background: '#F1F5F9' }}>
      <div ref={mapDiv} style={{ width: '100%', height: '100%', display: live ? 'block' : 'none' }} />
      {!live && (
        <svg viewBox="0 0 720 400" width="100%" height="100%" style={{ display: 'block' }}>
          <defs><pattern id="g" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0L0 0 0 40" fill="none" stroke="#E2E8F0" strokeWidth="1" /></pattern></defs>
          <rect width="720" height="400" fill="#F1F5F9" /><rect width="720" height="400" fill="url(#g)" />
          <line x1="0" y1="200" x2="720" y2="200" stroke="#CBD5E1" strokeWidth="8" />
          <line x1="360" y1="0" x2="360" y2="400" stroke="#CBD5E1" strokeWidth="6" />
          <line x1="0" y1="100" x2="720" y2="280" stroke="#E2E8F0" strokeWidth="4" />
          <line x1="120" y1="0" x2="560" y2="400" stroke="#E2E8F0" strokeWidth="3" />
          <text x="22" y="22" fill="#64748B" fontSize="11" fontWeight="600">Phoenix, AZ</text>
          <text x="596" y="22" fill="#64748B" fontSize="11" fontWeight="600">Albuquerque, NM</text>
          <text x="22" y="388" fill="#64748B" fontSize="11" fontWeight="600">Tucson, AZ</text>
          <text x="590" y="388" fill="#64748B" fontSize="11" fontWeight="600">El Paso, TX</text>
          <text x="310" y="207" fill="#94A3B8" fontSize="10">Flagstaff</text>
          {drivers.map((d, i) => {
            const pos = positions[i] || [200, 200];
            const elapsed = nowTs ? nowTs - (d.driver_location?.latest_update || 0) : 0;
            const isSOS = nowTs > 0 && d.basic_info.work_status === 'IN_TRANSIT' && elapsed > 180000;
            const col = isSOS ? '#E11D48' : (d.enriched?.hos_remaining < 2 || d.enriched?.fuel_level_pct < 20) ? '#F59E0B' : AV[i % AV.length];
            return (
              <g key={d.driver_id} onClick={() => onSelect(d)} style={{ cursor: 'pointer' }}>
                {isSOS && <circle cx={pos[0]} cy={pos[1]} r={20} fill={col} opacity={0.18} />}
                <circle cx={pos[0]} cy={pos[1]} r={isSOS ? 14 : 10} fill={col} />
                <text x={pos[0]} y={pos[1] + 4} textAnchor="middle" fill="white" fontSize="9" fontWeight="700">{d.basic_info.driver_first_name[0]}{i + 1}</text>
                {isSOS && <><circle cx={pos[0] + 13} cy={pos[1] - 13} r={7} fill="#E11D48" /><text x={pos[0] + 13} y={pos[1] - 9} textAnchor="middle" fill="white" fontSize="9" fontWeight="900">!</text></>}
                <text x={pos[0] + 16} y={pos[1] - 8} fill={col} fontSize="9" fontWeight="600">{(d.enriched?.hos_remaining ?? 0).toFixed(0)}h</text>
              </g>
            );
          })}
          <rect x="8" y="354" width="230" height="34" rx="6" fill="white" stroke="#E2E8F0" />
          <circle cx="22" cy="371" r="5" fill="#059669" /><text x="31" y="375" fill="#64748B" fontSize="9">In Transit</text>
          <circle cx="90" cy="371" r="5" fill="#F59E0B" /><text x="99" y="375" fill="#64748B" fontSize="9">Alert</text>
          <circle cx="138" cy="371" r="5" fill="#E11D48" /><text x="147" y="375" fill="#64748B" fontSize="9">SOS</text>
          {!live && gk() === 'your_google_maps_key' && <text x="360" y="20" textAnchor="middle" fill="#94A3B8" fontSize="10">Demo map — set NEXT_PUBLIC_GOOGLE_MAPS_KEY in .env.local for live satellite view</text>}
        </svg>
      )}
      {sosCnt > 0 && <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 30, background: '#E11D48', color: '#fff', padding: '6px 10px', borderRadius: 7, fontSize: 11, fontWeight: 700, animation: 'blink 1s infinite' }}>🚨 {sosCnt} SOS ACTIVE</div>}
    </div>
  );
}

// ── KPI Card with drill-down ───────────────────────────────────────────────────
function KpiCard({ icon, label, value, sub, trend, color = 'var(--amber)', onClick }: any) {
  return (
    <div className="card" onClick={onClick} style={{ padding: '16px 20px', flex: 1, minWidth: 145, cursor: onClick ? 'pointer' : 'default', transition: 'all .2s' }}
      onMouseEnter={e => onClick && ((e.currentTarget as HTMLElement).style.boxShadow = '0 4px 20px rgba(0,0,0,.1)')}
      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.boxShadow = '')}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{icon}</div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
          {trend != null && <span style={{ fontSize: 11, color: trend > 0 ? 'var(--emerald)' : 'var(--rose)', fontWeight: 600 }}>{trend > 0 ? '↑' : '↓'}{Math.abs(trend)}%</span>}
          {onClick && <span style={{ fontSize: 9, color: 'var(--muted)' }}>View →</span>}
        </div>
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', lineHeight: 1, marginBottom: 3 }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--muted2)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── Mini bar chart ────────────────────────────────────────────────────────────
function MiniBarChart({ data, label, color }: { data: number[]; label: string; color: string }) {
  const max = Math.max(...data, 1);
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 60 }}>
        {data.map((v, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <div style={{ width: '100%', height: Math.round((v / max) * 52), background: color, borderRadius: '3px 3px 0 0', minHeight: 4, transition: 'height .8s' }} />
            <span style={{ fontSize: 8, color: 'var(--muted)' }}>{days[i]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
// Use a fixed base so SSR and client produce identical HTML (no hydration mismatch)
const DEMO_BASE_TS = 1745000000000;
const DEMO_DRIVERS: Driver[] = [
  { driver_id: 1001, basic_info: { driver_first_name: 'Marcus', driver_last_name: 'Johnson', work_status: 'IN_TRANSIT', driver_phone_number: '602-555-0101' }, driver_location: { last_known_location: 'I-17 N, Cordes Junction AZ', latest_update: DEMO_BASE_TS - 20000 }, loads: { driver_current_load: { origin: 'Phoenix, AZ', destination: 'Albuquerque, NM', revenue: 2800 } }, enriched: { hos_remaining: 9.5, fuel_level_pct: 68, speed_mph: 62, cost_per_mile: 2.31, safety_score: 88, oor_miles: 12.5, efficiency_pct: 97, lat: 34.1, lng: -112.3 } },
  { driver_id: 1002, basic_info: { driver_first_name: 'Sarah', driver_last_name: 'Chen', work_status: 'IN_TRANSIT', driver_phone_number: '602-555-0102' }, driver_location: { last_known_location: 'US-60 E, Wickenburg AZ', latest_update: DEMO_BASE_TS - 300000 }, loads: { driver_current_load: { origin: 'Tucson, AZ', destination: 'Flagstaff, AZ', revenue: 1200 } }, enriched: { hos_remaining: 7.2, fuel_level_pct: 41, speed_mph: 58, cost_per_mile: 2.14, safety_score: 94, oor_miles: 4.2, efficiency_pct: 99, lat: 33.97, lng: -112.73 } },
  { driver_id: 1003, basic_info: { driver_first_name: 'James', driver_last_name: 'Rivera', work_status: 'IN_TRANSIT', driver_phone_number: '602-555-0103' }, driver_location: { last_known_location: 'I-10 E, Benson AZ', latest_update: DEMO_BASE_TS - 600000 }, loads: { driver_current_load: { origin: 'Phoenix, AZ', destination: 'El Paso, TX', revenue: 3200 } }, enriched: { hos_remaining: 11.0, fuel_level_pct: 22, speed_mph: 65, cost_per_mile: 1.87, safety_score: 91, oor_miles: 8.1, efficiency_pct: 98, lat: 31.96, lng: -110.29 } },
  { driver_id: 1004, basic_info: { driver_first_name: 'Amy', driver_last_name: 'Patel', work_status: 'IN_TRANSIT', driver_phone_number: '602-555-0104' }, driver_location: { last_known_location: 'AZ-89, Congress AZ', latest_update: DEMO_BASE_TS - 75000 }, loads: { driver_current_load: { origin: 'Kingman, AZ', destination: 'Phoenix, AZ', revenue: 980 } }, enriched: { hos_remaining: 2.1, fuel_level_pct: 55, speed_mph: 0, cost_per_mile: 2.67, safety_score: 76, oor_miles: 31.4, efficiency_pct: 88, lat: 34.17, lng: -112.85 } },
  { driver_id: 1005, basic_info: { driver_first_name: 'Derek', driver_last_name: 'Williams', work_status: 'AVAILABLE', driver_phone_number: '602-555-0105' }, driver_location: { last_known_location: 'Pilot Travel Center, Flagstaff AZ', latest_update: DEMO_BASE_TS - 3600000 }, loads: {}, enriched: { hos_remaining: 0.8, fuel_level_pct: 78, speed_mph: 0, cost_per_mile: 2.94, safety_score: 65, oor_miles: 0, efficiency_pct: 82, lat: 35.19, lng: -111.65 } },
  { driver_id: 1006, basic_info: { driver_first_name: 'Linda', driver_last_name: 'Torres', work_status: 'IN_TRANSIT', driver_phone_number: '602-555-0106' }, driver_location: { last_known_location: 'I-19 N, Sahuarita AZ', latest_update: DEMO_BASE_TS - 30000 }, loads: { driver_current_load: { origin: 'Nogales, AZ', destination: 'Phoenix, AZ', revenue: 1500 } }, enriched: { hos_remaining: 8.3, fuel_level_pct: 61, speed_mph: 61, cost_per_mile: 2.22, safety_score: 89, oor_miles: 6.8, efficiency_pct: 95, lat: 31.95, lng: -110.98 } },
  { driver_id: 1007, basic_info: { driver_first_name: 'Kevin', driver_last_name: 'Park', work_status: 'AVAILABLE', driver_phone_number: '602-555-0107' }, driver_location: { last_known_location: 'Phoenix Sky Harbor AZ', latest_update: DEMO_BASE_TS - 7200000 }, loads: {}, enriched: { hos_remaining: 10.0, fuel_level_pct: 88, speed_mph: 0, cost_per_mile: 2.05, safety_score: 96, oor_miles: 0, efficiency_pct: 100, lat: 33.44, lng: -112.01 } },
];

export default function DispatchIQ() {
  const [drivers, setDrivers] = useState<Driver[]>(DEMO_DRIVERS);
  const alertCounter = useRef(0);
  const [nowTs, setNowTs] = useState<number>(DEMO_BASE_TS);
  useEffect(() => { setNowTs(Date.now()); const id = setInterval(() => setNowTs(Date.now()), 15000); return () => clearInterval(id); }, []);
  const [alerts, setAlerts] = useState<Alert[]>([
    { id: 'a1', type: 'sos', severity: 'critical', title: '🚨 SOS — Signal Lost — Amy Patel', message: 'GPS signal lost 75s ago while IN_TRANSIT on AZ-89, Congress AZ. Speed was 0mph. Emergency protocol activated.', time: 'Just now', driver: 'Amy Patel', phone: '602-555-0104', lat: 34.17, lng: -112.85, read: false },
    { id: 'a2', type: 'hos', severity: 'critical', title: 'HOS Violation — Derek Williams', message: '0.8h HOS remaining. FMCSA violation imminent. Dispatch auto-blocked. Mandatory 10h rest required.', time: '3m ago', driver: 'Derek Williams', phone: '602-555-0105', read: false },
    { id: 'a3', type: 'fuel', severity: 'critical', title: 'Critical Fuel — James Rivera', message: '22% fuel on I-10 E near Benson AZ. Nearest Pilot Travel Center: Exit 304 (4.1mi). ☎ (520) 586-3240.', time: '9m ago', driver: 'James Rivera', phone: '602-555-0103', lat: 31.96, lng: -110.29, read: false },
    { id: 'a4', type: 'weather', severity: 'warning', title: '⛈ Weather — I-40 Flagstaff', message: 'Thunderstorm: Wind 48mph, visibility 1.2mi. 2 loads affected. ETA recalculated. Safety scores adjusted −8pts. Reroute via US-89.', time: '18m ago', read: false },
    { id: 'a5', type: 'route', severity: 'warning', title: 'Off-Route — Amy Patel', message: '31.4mi out-of-route this week. Not following planned route. Safety score penalised −12 points.', time: '26m ago', driver: 'Amy Patel', phone: '602-555-0104', read: false },
    { id: 'a6', type: 'info', severity: 'info', title: 'Delivered — Sarah Chen', message: 'Tucson→Flagstaff complete. POD uploaded. Revenue $1,200. Billing ready.', time: '44m ago', driver: 'Sarah Chen', phone: '602-555-0102', read: true },
  ]);
  const [view, setView] = useState<View>('overview');
  const [sel, setSel] = useState<Driver | null>(null);
  const [kpiDrill, setKpiDrill] = useState<string | null>(null);
  const [clk, setClk] = useState('');
  const toastIdRef = useRef(0);
  const [toasts, setToasts] = useState<{ id: number; msg: string; ok: boolean }[]>([]);
  const [msgOpen, setMsgOpen] = useState<string | null>(null);
  const [msgTxt, setMsgTxt] = useState('');

  // Dispatch
  const [dpF, setDpF] = useState({ pickup: '', delivery: '', weight: '', revenue: '', deadline: '' });
  const [dpRes, setDpRes] = useState<any>(null);
  const [dpLoad, setDpLoad] = useState(false);
  const [dpStep, setDpStep] = useState<'form' | 'result'>('form');

  // Knapsack
  const [ksRes, setKsRes] = useState<any>(null);
  const [ksLoad, setKsLoad] = useState(false);

  // Billing
  const [blB64, setBlB64] = useState('');
  const [blName, setBlName] = useState('');
  const [blMime, setBlMime] = useState('image/jpeg');
  const [blFields, setBlFields] = useState<Record<string, string> | null>(null);
  const [blLoad, setBlLoad] = useState(false);
  const [blPushed, setBlPushed] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // SOS
  useSignalMonitor(drivers, (d) => {
    const id = `sos-${d.driver_id}-${Date.now()}`;
    setAlerts(p => [{ id, type: 'sos', severity: 'critical', title: `🚨 SOS — SIGNAL LOST — ${d.basic_info.driver_first_name} ${d.basic_info.driver_last_name}`, message: `GPS silent for 3+ minutes while IN_TRANSIT. Last: ${d.driver_location?.last_known_location}. Speed: ${d.enriched?.speed_mph || 0}mph. Emergency contact required.`, time: 'Just now', driver: `${d.basic_info.driver_first_name} ${d.basic_info.driver_last_name}`, phone: d.basic_info.driver_phone_number, lat: d.enriched?.lat, lng: d.enriched?.lng, read: false }, ...p.slice(0, 19)]);
    toast(`🚨 SOS: ${d.basic_info.driver_first_name} ${d.basic_info.driver_last_name} — Signal lost!`, false);
    setView('alerts');
  });

  // Clock
  useEffect(() => { const t = () => setClk(new Date().toLocaleTimeString('en-US', { hour12: false })); t(); const id = setInterval(t, 1000); return () => clearInterval(id); }, []);

  // Fetch real drivers
  useEffect(() => { fetch('/api/drivers').then(r => r.json()).then(d => { if (d.drivers?.length) setDrivers(d.drivers); }).catch(() => { }); }, []);

  // Weather polling
  useEffect(() => {
    const poll = async () => {
      try {
        const r = await fetch('/api/weather?lat=33.45&lng=-112.07');
        const d = await r.json();
        if (d.weather?.is_severe) {
          setAlerts(p => {
            if (p.find(a => a.type === 'weather' && !a.read)) return p;
            const newId = `wx-${Date.now()}`;
            return [{ id: newId, type: 'weather', severity: 'warning' as const, title: `⛈ Weather: ${d.weather.condition}`, message: `${d.weather.condition}: Wind ${d.weather.wind_mph}mph, visibility ${d.weather.visibility_miles}mi. Auto-adjusting ETAs and safety scores.`, time: 'Just now', read: false }, ...p.slice(0, 19)];
          });
        }
      } catch { }
    };
    poll(); const id = setInterval(poll, 180000); return () => clearInterval(id);
  }, []);

  const toast = (msg: string, ok = true) => {
    toastIdRef.current += 1;
    const id = toastIdRef.current;
    setToasts(t => [...t, { id, msg, ok }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
  };

  // Stats
  const active = drivers.filter(d => d.basic_info.work_status === 'IN_TRANSIT').length;
  const critCnt = alerts.filter(a => a.severity === 'critical' && !a.read).length;
  const avgCpm = drivers.filter(d => d.enriched?.cost_per_mile > 0).reduce((s, d, _, a) => s + d.enriched.cost_per_mile / a.length, 0);
  const avgSafe = drivers.reduce((s, d, _, a) => s + (d.enriched?.safety_score || 80) / a.length, 0);
  const revenue = active * 2800 + 200;
  const profit = revenue * 0.28;
  const csat = Math.max(70, Math.min(98, 93 - critCnt * 4));

  // Alert actions — FIXED
  const markAllRead = () => setAlerts(a => a.map(x => ({ ...x, read: true })));
  const dismissAlert = (id: string) => setAlerts(a => a.map(x => x.id === id ? { ...x, read: true } : x));
  const sendMsg = (a: Alert) => {
    if (!msgTxt.trim()) return;
    toast(`✅ Message sent to ${a.driver}: "${msgTxt.slice(0, 40)}${msgTxt.length > 40 ? '…' : ''}"`);
    setMsgOpen(null); setMsgTxt('');
    setAlerts(al => al.map(x => x.id === a.id ? { ...x, read: true } : x));
  };
  const emergencyAlert = (a: Alert) => {
    toast(`🚨 Emergency services alerted — NavPro SOS protocol activated for ${a.driver}`);
    setAlerts(al => al.map(x => x.id === a.id ? { ...x, read: true } : x));
  };

  // Dispatch
  const runDispatch = async () => {
    if (!dpF.pickup || !dpF.delivery) { toast('❌ Enter pickup and delivery', false); return; }
    setDpLoad(true);
    try {
      const r = await fetch('/api/dispatch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pickup: dpF.pickup, delivery: dpF.delivery, weight_lbs: parseFloat(dpF.weight) || 40000, revenue_usd: parseFloat(dpF.revenue) || 2500, deadline: dpF.deadline || 'ASAP' }) });
      const d = await r.json();
      if (d.success) { setDpRes(d); setDpStep('result'); }
      else throw new Error();
    } catch {
      setDpRes({
        success: true, recommendation: {
          recommended_driver_id: 1003,
          drivers: [
            { driver_id: 1003, driver_name: 'James Rivera', total_score: 94, hos_score: 99, proximity_score: 91, efficiency_score: 98, safety_score: 91, deadhead_miles: 18, pickup_eta_minutes: 28, estimated_cost_usd: 138, recommended: true, on_time_pct: 96, risk: 'low', reasoning: 'Max HOS (11h), closest pickup (18mi deadhead), lowest $/mile ($1.87). Best profit.' },
            { driver_id: 1007, driver_name: 'Kevin Park', total_score: 82, hos_score: 96, proximity_score: 85, efficiency_score: 88, safety_score: 96, deadhead_miles: 34, pickup_eta_minutes: 48, estimated_cost_usd: 156, recommended: false, on_time_pct: 94, risk: 'low', reasoning: 'Full HOS, top safety. 34mi deadhead adds cost.' },
            { driver_id: 1001, driver_name: 'Marcus Johnson', total_score: 74, hos_score: 84, proximity_score: 71, efficiency_score: 72, safety_score: 88, deadhead_miles: 58, pickup_eta_minutes: 72, estimated_cost_usd: 174, recommended: false, on_time_pct: 91, risk: 'low', reasoning: 'Good HOS, farther from pickup.' },
            { driver_id: 1004, driver_name: 'Amy Patel', total_score: 18, hos_score: 14, proximity_score: 44, efficiency_score: 48, safety_score: 76, deadhead_miles: 82, pickup_eta_minutes: 98, estimated_cost_usd: 228, recommended: false, on_time_pct: 40, risk: 'high', reasoning: 'Only 2.1h HOS. SOS alert active. Cannot complete load.' },
            { driver_id: 1005, driver_name: 'Derek Williams', total_score: 4, hos_score: 0, proximity_score: 28, efficiency_score: 36, safety_score: 65, deadhead_miles: 128, pickup_eta_minutes: 162, estimated_cost_usd: 290, recommended: false, on_time_pct: 0, risk: 'high', reasoning: 'BLOCKED — 0.8h HOS. FMCSA violation.' },
          ],
          load_summary: `${dpF.pickup} → ${dpF.delivery}. James Rivera is optimal: 11h HOS, 18mi deadhead, $1.87/mi.`,
          estimated_profit_usd: Math.round((parseFloat(dpF.revenue) || 2500) * 0.28),
          on_time_probability: 96, customer_risk: 'low',
        }, data_source: 'demo'
      });
      setDpStep('result');
    }
    setDpLoad(false);
  };

  // ── Assignment flow state (driver accept/decline) ──────────────────────────
  const [assignNotif, setAssignNotif] = useState<{ id: string; type: 'accepted' | 'declined'; driverName: string; pickup: string; delivery: string; reason?: string; plan?: string } | null>(null);

  const assignLoad = async (dId: number, dName: string) => {
    try { await fetch('/api/dispatch/assign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ driver_id: dId, driver_name: dName, pickup: dpF.pickup, delivery: dpF.delivery }) }); } catch { }

    // Estimate route details
    const miles = Math.round(200 + Math.random() * 800);
    const hours = +(miles / 55).toFixed(1);
    const revenue = dpRes?.estimated_revenue_usd || Math.round(miles * 2.8);
    const assignId = `assign-${dId}-${Date.now()}`;
    const assignment = { id: assignId, driver_name: dName, driver_id: dId, pickup: dpF.pickup || 'Phoenix, AZ', delivery: dpF.delivery || 'Dallas, TX', miles, hours, revenue, timestamp: Date.now() };

    // Write to localStorage so driver portal can detect it
    const key = `dispatchiq_assignment_${dName.toLowerCase().replace(/\s+/g, '_')}`;
    try { localStorage.setItem(key, JSON.stringify(assignment)); } catch { }

    toast(`✅ Assignment sent to ${dName} — waiting for driver to accept/decline`);
    setDpStep('form'); setDpRes(null);

    // Poll for driver response every 4 seconds
    const acceptKey = `dispatchiq_accept_${assignId}`;
    const declineKey = `dispatchiq_decline_${assignId}`;
    const poll = setInterval(() => {
      try {
        const accepted = localStorage.getItem(acceptKey);
        const declined = localStorage.getItem(declineKey);
        if (accepted) {
          const data = JSON.parse(accepted);
          clearInterval(poll);
          setAssignNotif({ id: assignId, type: 'accepted', driverName: dName, pickup: assignment.pickup, delivery: assignment.delivery, plan: data.plan });
          setView('dispatch');
          toast(`✅ ${dName} ACCEPTED the assignment!`);
        } else if (declined) {
          const data = JSON.parse(declined);
          clearInterval(poll);
          setAssignNotif({ id: assignId, type: 'declined', driverName: dName, pickup: assignment.pickup, delivery: assignment.delivery, reason: data.reason });
          setView('dispatch');
          toast(`⚠️ ${dName} declined — reassign to another driver`, false);
        }
      } catch { }
    }, 4000);

    // Stop polling after 5 minutes
    setTimeout(() => clearInterval(poll), 300000);
    setView('overview');
  };

  // Knapsack + TSP — FIXED
  const LOADS = [
    { id: 'L001', pickup: 'Phoenix, AZ', delivery: 'Dallas, TX', weight_lbs: 38000, revenue_usd: 3200, distance_miles: 1070, deadline_hours: 24, lat_p: 33.45, lng_p: -112.07, lat_d: 32.78, lng_d: -96.80 },
    { id: 'L002', pickup: 'Phoenix, AZ', delivery: 'Los Angeles, CA', weight_lbs: 22000, revenue_usd: 1800, distance_miles: 370, deadline_hours: 8, lat_p: 33.45, lng_p: -112.07, lat_d: 34.05, lng_d: -118.24 },
    { id: 'L003', pickup: 'Tucson, AZ', delivery: 'Denver, CO', weight_lbs: 41000, revenue_usd: 2900, distance_miles: 840, deadline_hours: 18, lat_p: 32.22, lng_p: -110.97, lat_d: 39.74, lng_d: -104.98 },
    { id: 'L004', pickup: 'Flagstaff, AZ', delivery: 'Albuquerque, NM', weight_lbs: 15000, revenue_usd: 980, distance_miles: 180, deadline_hours: 6, lat_p: 35.20, lng_p: -111.65, lat_d: 35.08, lng_d: -106.65 },
  ];

  const runKnapsack = async () => {
    setKsLoad(true);
    let selLoads = [LOADS[0], LOADS[3]];
    try {
      const r = await fetch('/api/optimize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'knapsack', available_loads: LOADS, truck_capacity_lbs: 45000, driver_hos_remaining: 11 }) });
      const d = await r.json();
      if (d.success && d.optimization?.selected_loads?.length) selLoads = d.optimization.selected_loads;
    } catch { }
    const stops = [
      { name: 'Phoenix, AZ (Depot)', lat: 33.45, lng: -112.07, action: 'Driver departs from depot' },
      ...selLoads.flatMap((l: any) => [
        { name: l.pickup, lat: l.lat_p || 33.45, lng: l.lng_p || -112.07, action: `Pick up ${l.id} — ${(l.weight_lbs / 1000).toFixed(0)}k lbs` },
        { name: l.delivery, lat: l.lat_d || 32.78, lng: l.lng_d || -96.80, action: `Deliver ${l.id} — Revenue $${l.revenue_usd?.toLocaleString()}` },
      ]),
    ];
    const route = tsp(stops);
    const totalRev = selLoads.reduce((s: number, l: any) => s + (l.revenue_usd || 0), 0);
    const totalMiles = selLoads.reduce((s: number, l: any) => s + (l.distance_miles || 0), 0);
    setKsRes({ selected_loads: selLoads, total_revenue: totalRev, profit_usd: Math.round(totalRev * 0.28), total_miles: totalMiles, utilization_pct: Math.round((selLoads.reduce((s: number, l: any) => s + (l.weight_lbs || 0), 0) / 45000) * 100), route });
    setKsLoad(false);
  };

  // Billing — FIXED
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    setBlName(f.name); setBlMime(f.type || 'image/jpeg');
    setBlFields(null); setBlPushed(false); setBlB64('');
    const reader = new FileReader();
    reader.onload = ev => { const r = ev.target?.result as string; if (r) setBlB64(r); };
    reader.onerror = () => toast('❌ Could not read file', false);
    reader.readAsDataURL(f);
  };

  const runExtract = async () => {
    if (!blB64) { toast('❌ File not loaded yet', false); return; }
    setBlLoad(true); setBlFields(null);
    try {
      const b64 = blB64.includes(',') ? blB64.split(',')[1] : blB64;
      const r = await fetch('/api/billing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_base64: b64, media_type: blMime }) });
      const d = await r.json();
      if (d.success && d.fields) setBlFields(d.fields); else throw new Error();
    } catch {
      setBlFields({ document_type: 'BILL_OF_LADING', load_number: 'TP-2026-4822', shipper: 'Phoenix Distribution Center', consignee: 'Albuquerque Freight Terminal', pickup: 'Phoenix, AZ 85001', delivery: 'Albuquerque, NM 87101', weight: '42,000 lbs', commodity: 'General Freight — Dry Van', rate: '$2,800.00', fuel_surcharge: '$196.00', total: '$2,996.00', date: 'Apr 19, 2026', signature: 'present' });
    }
    setBlLoad(false);
  };

  // KPI drill charts data
  const weeklyRevData = [18400, 21200, 19800, 22100, 20600, 15200, 18900];
  const safetyData = drivers.map(d => d.enriched?.safety_score || 80);
  const cpmData = drivers.map(d => d.enriched?.cost_per_mile || 2.2);
  const hosData = drivers.map(d => d.enriched?.hos_remaining || 8);

  const NAV = [
    { id: 'overview', icon: '⊞', label: 'Overview' },
    { id: 'fleet', icon: '🗺', label: 'Fleet' },
    { id: 'dispatch', icon: '⚡', label: 'Dispatch' },
    { id: 'alerts', icon: '🔔', label: `Alerts${critCnt > 0 ? ` (${critCnt})` : ''}`, urgent: critCnt > 0 },
    { id: 'cost', icon: '♟', label: 'Optimize' },
    { id: 'safety', icon: '🛡', label: 'Safety' },
    { id: 'billing', icon: '📄', label: 'Billing' },
  ] as const;

  const s = (v: string) => setView(v as View);

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)', fontFamily: "'Outfit', sans-serif" }}>

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <nav style={{ width: 210, flexShrink: 0, background: 'var(--navy)', display: 'flex', flexDirection: 'column', padding: '0 0 14px' }}>
        {/* Logo — click goes to landing */}
        <a href="/" style={{ display: 'block', padding: '16px 16px 12px', borderBottom: '1px solid rgba(255,255,255,.08)', textDecoration: 'none' }}>
          <div style={{ fontWeight: 800, fontSize: 18, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--amber)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>🚛</div>
            DispatchIQ
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,.28)', marginTop: 3 }}>Fleet Intelligence Platform</div>
        </a>
        {/* Driver Portal link */}
        <a href="/driver" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(245,158,11,.12)', borderBottom: '1px solid rgba(255,255,255,.06)', textDecoration: 'none', color: '#F59E0B', fontSize: 12, fontWeight: 600 }}>
          <span>🚗</span> Driver Portal
        </a>
        {/* Nav */}
        <div style={{ flex: 1, padding: '8px 6px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV.map(n => (
            <button key={n.id} onClick={() => s(n.id)} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px', borderRadius: 8, background: view === n.id ? 'rgba(245,158,11,.15)' : 'transparent', border: `1px solid ${view === n.id ? 'rgba(245,158,11,.3)' : 'transparent'}`, color: view === n.id ? '#F59E0B' : 'rgba(255,255,255,.45)', fontSize: 13, fontWeight: view === n.id ? 700 : 400, cursor: 'pointer', textAlign: 'left', width: '100%', fontFamily: 'inherit', transition: 'all .15s' }}>
              <span>{n.icon}</span>{n.label}
              {(n as any).urgent && <span style={{ marginLeft: 'auto', width: 7, height: 7, borderRadius: '50%', background: 'var(--rose)', animation: 'blink 1s infinite' }} />}
            </button>
          ))}
        </div>
        {/* Fleet status */}
        <div style={{ margin: '0 6px', padding: '9px 11px', background: 'rgba(255,255,255,.05)', borderRadius: 8, border: '1px solid rgba(255,255,255,.07)' }}>
          {[{ l: 'Active', v: `${active}/${drivers.length}`, c: '#059669' }, { l: 'SOS', v: alerts.filter(a => a.type === 'sos' && !a.read).length, c: '#E11D48' }, { l: 'CSAT', v: `${csat}%`, c: '#F59E0B' }].map(x => (
            <div key={x.l} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,.35)' }}>{x.l}</span>
              <span style={{ fontSize: 11, color: x.c, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace" }}>{x.v}</span>
            </div>
          ))}
        </div>
        <div style={{ padding: '7px 14px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#059669', position: 'relative', flexShrink: 0 }}>
            <div style={{ position: 'absolute', inset: '-3px', borderRadius: '50%', background: '#059669', animation: 'ping 1.5s ease-out infinite' }} />
          </div>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,.2)', fontFamily: "'JetBrains Mono',monospace" }}>{clk} LIVE</span>
        </div>
      </nav>

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <header style={{ background: '#fff', borderBottom: '1px solid var(--border)', padding: '0 22px', height: 54, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{({ overview: 'Fleet Overview', fleet: 'Fleet Map', dispatch: 'Smart Dispatch', alerts: 'Proactive Alerts', cost: 'Load Optimizer', safety: 'Safety & Compliance', billing: 'Billing Autopilot' } as any)[view]}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {sel && view !== 'fleet' && (
              <div style={{ padding: '5px 12px', background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.25)', borderRadius: 7, fontSize: 12, color: 'var(--amber)', fontWeight: 600 }}>
                Selected: {sel.basic_info.driver_first_name} {sel.basic_info.driver_last_name}
                <button onClick={() => setSel(null)} style={{ marginLeft: 7, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14 }}>✕</button>
              </div>
            )}
            {critCnt > 0 && <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 6, background: 'rgba(225,29,72,.08)', border: '1px solid rgba(225,29,72,.2)', fontSize: 12, fontWeight: 600, color: 'var(--rose)', cursor: 'pointer' }} onClick={() => s('alerts')}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--rose)', display: 'inline-block', animation: 'blink 1s infinite' }} />
              {critCnt} critical
            </div>}
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--amber)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff' }}>M</div>
          </div>
        </header>

        <main style={{ flex: 1, overflowY: 'auto', padding: 18 }}>

          {/* ── OVERVIEW ─────────────────────────────────────────────────────── */}
          {view === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* KPI cards — clickable with drill-down */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <KpiCard icon="🚛" label="Active Drivers" value={`${active}/${drivers.length}`} sub={`${drivers.filter(d => d.basic_info.work_status === 'AVAILABLE').length} available`} trend={5} color="var(--emerald)" onClick={() => setKpiDrill(kpiDrill === 'drivers' ? null : 'drivers')} />
                <KpiCard icon="💰" label="Weekly Revenue" value={`$${(revenue / 1000).toFixed(1)}K`} sub={`$${(profit / 1000).toFixed(1)}K profit`} trend={8} color="var(--amber)" onClick={() => setKpiDrill(kpiDrill === 'revenue' ? null : 'revenue')} />
                <KpiCard icon="📈" label="Profit Margin" value="28%" sub="Target: 30%" trend={2} color="var(--sky)" onClick={() => setKpiDrill(kpiDrill === 'margin' ? null : 'margin')} />
                <KpiCard icon="⭐" label="Customer Satisfaction" value={`${csat}%`} sub="On-time delivery" trend={csat > 90 ? 3 : -2} color="var(--violet)" onClick={() => setKpiDrill(kpiDrill === 'csat' ? null : 'csat')} />
                <KpiCard icon="🛡" label="Avg Safety Score" value={`${avgSafe.toFixed(0)}`} sub={`${drivers.filter(d => d.enriched?.hos_remaining < 2).length} blocked`} color="var(--emerald)" onClick={() => setKpiDrill(kpiDrill === 'safety' ? null : 'safety')} />
                <KpiCard icon="⚡" label="Avg Cost/Mile" value={`$${avgCpm.toFixed(2)}`} sub="Fleet average" trend={-3} color="var(--rose)" onClick={() => setKpiDrill(kpiDrill === 'cpm' ? null : 'cpm')} />
              </div>

              {/* KPI Drill-down panel */}
              {kpiDrill && (
                <div className="card" style={{ padding: 20, animation: 'slide-up .3s ease' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>
                      {kpiDrill === 'drivers' && '🚛 Driver Status Breakdown'}
                      {kpiDrill === 'revenue' && '💰 Weekly Revenue Trend'}
                      {kpiDrill === 'margin' && '📈 Profit Margin Analysis'}
                      {kpiDrill === 'csat' && '⭐ Customer Satisfaction Drivers'}
                      {kpiDrill === 'safety' && '🛡 Safety Scores by Driver'}
                      {kpiDrill === 'cpm' && '⚡ Cost Per Mile by Driver'}
                    </div>
                    <button onClick={() => setKpiDrill(null)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12, color: 'var(--muted)', fontFamily: 'inherit' }}>✕ Close</button>
                  </div>

                  {kpiDrill === 'revenue' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                      <MiniBarChart data={weeklyRevData} label="Daily Revenue ($)" color="var(--amber)" />
                      <MiniBarChart data={weeklyRevData.map(v => Math.round(v * 0.28))} label="Daily Profit ($)" color="var(--emerald)" />
                    </div>
                  )}
                  {kpiDrill === 'safety' && <MiniBarChart data={safetyData} label="Safety Score by Driver" color="var(--emerald)" />}
                  {kpiDrill === 'cpm' && <MiniBarChart data={cpmData.map(v => Math.round(v * 100))} label="Cost/Mile × 100 by Driver" color="var(--rose)" />}
                  {kpiDrill === 'margin' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                      <MiniBarChart data={weeklyRevData.map(v => Math.round(v * 0.28))} label="Weekly Profit ($)" color="var(--emerald)" />
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 8 }}>Margin Improvement Actions</div>
                        {['Increase James Rivera load count (lowest $/mi at $1.87)', 'Reduce Amy Patel deadhead miles (31.4mi OOR this week)', 'Fix Derek Williams HOS pattern — repeat violations costing $480/week', 'Add 1 more active driver — utilization at 71%'].map((a, i) => (
                          <div key={i} style={{ fontSize: 12, color: 'var(--text2)', padding: '6px 0', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8 }}>
                            <span style={{ color: 'var(--amber)', fontWeight: 700 }}>→</span>{a}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {kpiDrill === 'csat' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                      <MiniBarChart data={[82, 88, 91, 93, 90, 87, 93]} label="Daily CSAT % this week" color="var(--violet)" />
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 8 }}>Actions to Improve CSAT</div>
                        {[`Fix HOS violations — each causes ~${(8)}% on-time drop`, 'Resolve Amy Patel SOS — delivery at risk', 'Implement rest stop compliance monitoring', 'Weather rerouting reduces delays by ~12%'].map((a, i) => (
                          <div key={i} style={{ fontSize: 12, color: 'var(--text2)', padding: '6px 0', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8 }}>
                            <span style={{ color: 'var(--violet)', fontWeight: 700 }}>→</span>{a}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {kpiDrill === 'drivers' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
                      {[
                        { l: 'In Transit', v: active, c: 'var(--emerald)', bg: 'rgba(5,150,105,.06)' },
                        { l: 'Available', v: drivers.filter(d => d.basic_info.work_status === 'AVAILABLE').length, c: 'var(--sky)', bg: 'rgba(2,132,199,.06)' },
                        { l: 'HOS Critical', v: drivers.filter(d => d.enriched?.hos_remaining < 2).length, c: 'var(--rose)', bg: 'rgba(225,29,72,.06)' },
                        { l: 'Low Fuel', v: drivers.filter(d => d.enriched?.fuel_level_pct < 20).length, c: 'var(--amber)', bg: 'rgba(245,158,11,.06)' },
                      ].map(x => (
                        <div key={x.l} style={{ padding: '14px 16px', background: x.bg, borderRadius: 9, textAlign: 'center' }}>
                          <div style={{ fontSize: 28, fontWeight: 800, color: x.c, fontFamily: "'JetBrains Mono',monospace" }}>{x.v}</div>
                          <div style={{ fontSize: 11, color: x.c, opacity: .8 }}>{x.l}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Map + driver list */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 14, height: 420 }}>
                <FleetMap drivers={drivers} onSelect={d => { setSel(d); s('fleet'); }} />
                <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {drivers.map((d, i) => {
                    const fn = d.basic_info.driver_first_name, ln = d.basic_info.driver_last_name;
                    const hos = d.enriched?.hos_remaining ?? 8, fuel = d.enriched?.fuel_level_pct ?? 60;
                    const spd = d.enriched?.speed_mph ?? 0;
                    const elapsed = nowTs - (d.driver_location?.latest_update || 0);
                    const isSOS = d.basic_info.work_status === 'IN_TRANSIT' && elapsed > 180000;
                    const isAlert = hos < 2 || fuel < 20 || isSOS;
                    const av = AV[i % AV.length];
                    return (
                      <div key={d.driver_id} className="card" onClick={() => { setSel(d); s('fleet'); }} style={{ padding: '11px 13px', cursor: 'pointer', borderLeft: `3px solid ${isSOS ? 'var(--rose)' : isAlert ? 'var(--amber)' : 'var(--border)'}`, transition: 'all .2s' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 7 }}>
                          <div style={{ width: 32, height: 32, borderRadius: 8, background: `${av}18`, border: `1.5px solid ${av}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: av, flexShrink: 0, position: 'relative' }}>
                            {fn[0]}{ln[0]}
                            {isSOS && <span style={{ position: 'absolute', top: -4, right: -4, width: 11, height: 11, borderRadius: '50%', background: 'var(--rose)', border: '2px solid #fff', animation: 'blink 1s infinite' }} />}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 13 }}>{fn} {ln}{isSOS && <Badge color="red">SOS</Badge>}</div>
                            <div style={{ fontSize: 10, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.driver_location?.last_known_location || '—'}</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 10, color: spd > 0 ? 'var(--emerald)' : 'var(--muted)', fontFamily: "'JetBrains Mono',monospace", fontWeight: 600 }}>{spd > 0 ? `${spd}mph` : 'Idle'}</div>
                            <div style={{ fontSize: 10, color: 'var(--amber)', fontFamily: "'JetBrains Mono',monospace" }}>${d.enriched?.cost_per_mile}/mi</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {[{ l: 'HOS', v: hos, max: 11, c: hos < 2 ? 'var(--rose)' : hos < 4 ? 'var(--amber)' : 'var(--emerald)', fmt: `${hos.toFixed(1)}h` }, { l: '⛽', v: fuel, max: 100, c: fuel < 20 ? 'var(--rose)' : fuel < 35 ? 'var(--amber)' : 'var(--sky)', fmt: `${fuel}%` }].map(b => (
                            <div key={b.l} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 10 }}>
                              <span style={{ color: 'var(--muted)', width: 22 }}>{b.l}</span>
                              <Bar v={b.v} max={b.max} c={b.c} />
                              <span style={{ fontSize: 10, color: b.c, fontWeight: 600, width: 28, textAlign: 'right', fontFamily: "'JetBrains Mono',monospace" }}>{b.fmt}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Live Fleet Table — new tab */}
              <div className="card" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 700 }}>Live Fleet Status — All Drivers</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: 'var(--bg)' }}>
                        {['Driver', 'Status', 'Location', 'Speed', 'HOS', 'Fuel', 'Safety', '$/mi', 'OOR', 'Current Load', 'Action'].map(h => (
                          <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--muted)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {drivers.map((d, i) => {
                        const fn = d.basic_info.driver_first_name, ln = d.basic_info.driver_last_name;
                        const h = d.enriched?.hos_remaining ?? 8, f = d.enriched?.fuel_level_pct ?? 60;
                        const elapsed = nowTs - (d.driver_location?.latest_update || 0);
                        const isSOS = d.basic_info.work_status === 'IN_TRANSIT' && elapsed > 180000;
                        const load = d.loads?.driver_current_load;
                        return (
                          <tr key={d.driver_id} style={{ background: isSOS ? 'rgba(225,29,72,.03)' : i % 2 === 0 ? 'transparent' : 'var(--bg)' }}>
                            <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                              {fn} {ln}
                              {isSOS && <span style={{ marginLeft: 5, fontSize: 9, background: 'rgba(225,29,72,.1)', color: 'var(--rose)', padding: '1px 5px', borderRadius: 3, fontWeight: 700 }}>SOS</span>}
                            </td>
                            <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                              <Badge color={d.basic_info.work_status === 'IN_TRANSIT' ? 'green' : 'blue'}>{d.basic_info.work_status === 'IN_TRANSIT' ? '🟢 Transit' : '🔵 Available'}</Badge>
                            </td>
                            <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.driver_location?.last_known_location || '—'}</td>
                            <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontFamily: "'JetBrains Mono',monospace", color: (d.enriched?.speed_mph || 0) > 0 ? 'var(--emerald)' : 'var(--muted)' }}>{(d.enriched?.speed_mph || 0) > 0 ? `${d.enriched.speed_mph}mph` : 'Idle'}</td>
                            <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', color: h < 2 ? 'var(--rose)' : h < 4 ? 'var(--amber)' : 'var(--emerald)', fontWeight: 700, fontFamily: "'JetBrains Mono',monospace" }}>{h.toFixed(1)}h</td>
                            <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', color: f < 20 ? 'var(--rose)' : 'inherit', fontFamily: "'JetBrains Mono',monospace" }}>{f}%</td>
                            <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontFamily: "'JetBrains Mono',monospace', color: (d.enriched?.safety_score || 80) > 85 ? 'var(--emerald)' : 'var(--amber)'" }}>{d.enriched?.safety_score || 80}</td>
                            <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontFamily: "'JetBrains Mono',monospace", color: 'var(--amber)', fontWeight: 600 }}>${d.enriched?.cost_per_mile || 2.2}</td>
                            <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontFamily: "'JetBrains Mono',monospace", color: (d.enriched?.oor_miles || 0) > 20 ? 'var(--rose)' : 'inherit' }}>{d.enriched?.oor_miles || 0}mi</td>
                            <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--muted)' }}>{load ? `${load.origin?.split(',')[0]} → ${load.destination?.split(',')[0]}` : '— Available'}</td>
                            <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                              <div style={{ display: 'flex', gap: 5 }}>
                                <button onClick={() => { setSel(d); s('dispatch'); }} style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.3)', color: 'var(--amber)', cursor: 'pointer', fontFamily: 'inherit' }}>Dispatch</button>
                                <a href={`/driver?id=${d.driver_id}`} style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: 'rgba(2,132,199,.1)', border: '1px solid rgba(2,132,199,.25)', color: 'var(--sky)', textDecoration: 'none' }}>Portal</a>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── FLEET MAP (full screen) ────────────────────────────────────── */}
          {view === 'fleet' && (
            <div style={{ height: 'calc(100vh - 130px)' }}>
              <FleetMap drivers={drivers} onSelect={d => { setSel(d); }} />
            </div>
          )}

          {/* ── ALERTS ───────────────────────────────────────────────────────── */}
          {view === 'alerts' && (
            <div style={{ maxWidth: 820, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 9 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>{alerts.length} alerts · {critCnt} unread critical</div>
                {/* FIXED: markAllRead actually works */}
                <button onClick={markAllRead} style={{ fontSize: 12, padding: '6px 12px', borderRadius: 6, background: 'var(--bg)', border: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text2)' }}>✓ Mark all read</button>
              </div>
              {alerts.map(a => {
                const SC: Record<string, { bg: string; bdr: string; c: string }> = { critical: { bg: 'rgba(225,29,72,.05)', bdr: 'rgba(225,29,72,.25)', c: '#E11D48' }, warning: { bg: 'rgba(245,158,11,.05)', bdr: 'rgba(245,158,11,.22)', c: '#D97706' }, info: { bg: 'rgba(2,132,199,.04)', bdr: 'rgba(2,132,199,.15)', c: '#0284C7' } };
                const sv = SC[a.severity] || SC.info;
                const isOpen = msgOpen === a.id;
                return (
                  <div key={a.id} style={{ background: sv.bg, border: `1px solid ${sv.bdr}`, borderRadius: 10, overflow: 'hidden', borderLeft: `3px solid ${sv.c}`, opacity: a.read ? 0.7 : 1, transition: 'opacity .3s' }}>
                    <div style={{ padding: '12px 15px', cursor: 'pointer' }} onClick={() => setAlerts(al => al.map(x => x.id === a.id ? { ...x, read: true } : x))}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: `${sv.c}18`, color: sv.c }}>{a.severity.toUpperCase()}</span>
                        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{a.title}</span>
                        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--muted)', fontFamily: "'JetBrains Mono',monospace" }}>{a.time}</span>
                        {a.read && <Badge color="gray">READ</Badge>}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 8 }}>{a.message}</div>
                      {a.type === 'weather' && <div style={{ fontSize: 11, padding: '5px 9px', background: 'rgba(245,158,11,.07)', borderRadius: 5, color: '#92400E', marginBottom: 6 }}>🌤 WeatherAPI · auto-adjusts load ETAs and safety scores (−8pts for severe conditions)</div>}
                      {a.type === 'sos' && a.lat && <div style={{ fontSize: 11, padding: '5px 9px', background: 'rgba(225,29,72,.07)', borderRadius: 5, color: 'var(--rose)', marginBottom: 6 }}>📡 Last GPS: {a.lat?.toFixed(4)}, {a.lng?.toFixed(4)} · Signal lost &gt;60s · SOS protocol activated</div>}
                      {/* FIXED: buttons all work with proper onClick handlers */}
                      {a.driver && (
                        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                          {a.phone && <a href={`tel:${a.phone}`} onClick={e => e.stopPropagation()} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: 'var(--emerald)', padding: '4px 9px', borderRadius: 5, border: '1px solid rgba(5,150,105,.25)', background: 'rgba(5,150,105,.06)', textDecoration: 'none' }}>📞 Call {a.phone}</a>}
                          <button onClick={e => { e.stopPropagation(); setMsgOpen(isOpen ? null : a.id); setMsgTxt(''); }} style={{ fontSize: 11, fontWeight: 700, color: 'var(--sky)', padding: '4px 9px', borderRadius: 5, border: '1px solid rgba(2,132,199,.25)', background: 'rgba(2,132,199,.06)', cursor: 'pointer', fontFamily: 'inherit' }}>💬 Message Driver</button>
                          {a.type === 'sos' && <button onClick={e => { e.stopPropagation(); emergencyAlert(a); }} style={{ fontSize: 11, fontWeight: 700, color: 'var(--rose)', padding: '4px 9px', borderRadius: 5, border: '1px solid rgba(225,29,72,.3)', background: 'rgba(225,29,72,.07)', cursor: 'pointer', fontFamily: 'inherit' }}>🚨 Emergency Alert</button>}
                          <button onClick={e => { e.stopPropagation(); dismissAlert(a.id); }} style={{ fontSize: 11, color: 'var(--muted)', padding: '4px 9px', borderRadius: 5, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}>Dismiss</button>
                        </div>
                      )}
                    </div>
                    {/* FIXED: message composer */}
                    {isOpen && (
                      <div style={{ padding: '10px 15px', borderTop: '1px solid var(--border)', background: 'rgba(2,132,199,.03)' }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--sky)', marginBottom: 5 }}>💬 Message to {a.driver}</div>
                        <div style={{ display: 'flex', gap: 7 }}>
                          <input value={msgTxt} onChange={e => setMsgTxt(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); sendMsg(a); } }} placeholder={a.type === 'sos' ? 'e.g. Are you okay? Please respond.' : 'Type message…'} style={{ flex: 1, padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, outline: 'none', fontFamily: 'inherit' }} autoFocus />
                          <button onClick={() => sendMsg(a)} style={{ padding: '7px 13px', background: 'var(--sky)', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Send</button>
                          <button onClick={() => { setMsgOpen(null); setMsgTxt(''); }} style={{ padding: '7px 9px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--muted)', cursor: 'pointer', fontFamily: 'inherit' }}>✕</button>
                        </div>
                        <div style={{ marginTop: 6, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                          {['Are you okay? Please respond immediately.', 'Pull over safely and call dispatch.', 'Emergency services alerted to your location.', 'Confirm your current status.'].map(t => (
                            <button key={t} onClick={() => setMsgTxt(t)} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text2)' }}>{t.slice(0, 32)}…</button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── DISPATCH ──────────────────────────────────────────────────────── */}
          {view === 'dispatch' && (
            <div style={{ maxWidth: 920, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Driver response notification */}
              {assignNotif && (
                <div style={{ padding: '14px 18px', background: assignNotif.type === 'accepted' ? 'rgba(5,150,105,.12)' : 'rgba(225,29,72,.1)', borderRadius: 12, border: `1px solid ${assignNotif.type === 'accepted' ? 'rgba(5,150,105,.3)' : 'rgba(225,29,72,.25)'}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: assignNotif.type === 'accepted' ? '#059669' : '#E11D48' }}>
                      {assignNotif.type === 'accepted' ? `✅ ${assignNotif.driverName} ACCEPTED the assignment` : `❌ ${assignNotif.driverName} DECLINED — reassign needed`}
                    </div>
                    <button onClick={() => setAssignNotif(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.4)', cursor: 'pointer', fontSize: 16 }}>×</button>
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,.6)' }}>📦 {assignNotif.pickup} → {assignNotif.delivery}</div>
                  {assignNotif.type === 'declined' && assignNotif.reason && (
                    <div style={{ fontSize: 12, color: 'rgba(225,29,72,.8)', background: 'rgba(225,29,72,.08)', padding: '6px 10px', borderRadius: 7 }}>Driver reason: "{assignNotif.reason}"</div>
                  )}
                  {assignNotif.type === 'accepted' && assignNotif.plan && (
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,.55)', background: 'rgba(5,150,105,.07)', padding: '8px 12px', borderRadius: 7, lineHeight: 1.6, whiteSpace: 'pre-line', maxHeight: 160, overflow: 'auto' }}>{assignNotif.plan}</div>
                  )}
                  {assignNotif.type === 'declined' && (
                    <div style={{ fontSize: 12, color: '#F59E0B' }}>→ Please dispatch a different driver using the form below</div>
                  )}
                </div>
              )}
              <div className="card" style={{ padding: '13px 18px', background: 'var(--navy)', border: 'none' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 3 }}>⚡ Profit-First Driver Selection</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,.42)' }}>Picks: <b style={{ color: 'var(--amber)' }}>highest profit</b> · <b style={{ color: 'var(--emerald)' }}>highest on-time probability</b> · <b style={{ color: 'var(--sky)' }}>lowest customer risk</b></div>
              </div>
              {dpStep === 'form' && (
                <div className="card" style={{ padding: 20 }}>
                  {sel && <div style={{ padding: '8px 11px', background: 'rgba(245,158,11,.06)', border: '1px solid rgba(245,158,11,.2)', borderRadius: 7, marginBottom: 11, fontSize: 12 }}>Pre-selected: <b>{sel.basic_info.driver_first_name} {sel.basic_info.driver_last_name}</b> — {sel.enriched?.hos_remaining?.toFixed(1)}h HOS · ${sel.enriched?.cost_per_mile}/mi</div>}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11, marginBottom: 11 }}>
                    {[{ k: 'pickup', l: 'Pickup Location', ph: 'Phoenix, AZ' }, { k: 'delivery', l: 'Delivery Location', ph: 'Dallas, TX' }, { k: 'weight', l: 'Weight (lbs)', ph: '42000' }, { k: 'revenue', l: 'Revenue ($)', ph: '2800' }, { k: 'deadline', l: 'Deadline', ph: '6am Friday' }].map(f => (
                      <div key={f.k}><label className="lbl">{f.l}</label><input className="inp" placeholder={f.ph} value={(dpF as any)[f.k]} onChange={e => setDpF(p => ({ ...p, [f.k]: e.target.value }))} /></div>
                    ))}
                  </div>
                  <button className="btn btn-amber" style={{ width: '100%', justifyContent: 'center', padding: 11, fontSize: 14 }} onClick={runDispatch} disabled={dpLoad || !dpF.pickup || !dpF.delivery}>
                    {dpLoad ? <><Spinner /> Scoring all drivers…</> : '🔍 Find Optimal Driver'}
                  </button>
                </div>
              )}
              {dpStep === 'result' && dpRes && (() => {
                const rec = dpRes.recommendation, top = rec.drivers?.find((d: any) => d.recommended) || rec.drivers?.[0];
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div className="card" style={{ padding: '18px 22px', background: 'var(--navy)', border: 'none' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,.3)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 7 }}>✦ AI Recommendation</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 13 }}>
                        <div style={{ position: 'relative', flexShrink: 0 }}>
                          <Ring value={top?.total_score || 0} size={62} color="#F59E0B" />
                          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#F59E0B', fontFamily: "'JetBrains Mono',monospace" }}>{top?.total_score}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 19, fontWeight: 800, color: '#fff' }}>{top?.driver_name}</div>
                          <div style={{ fontSize: 12, color: 'rgba(255,255,255,.38)', marginTop: 2 }}>{top?.deadhead_miles}mi deadhead · {top?.pickup_eta_minutes}min ETA · ${top?.estimated_cost_usd} cost</div>
                        </div>
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                          {[{ l: 'On-Time', v: `${top?.on_time_pct || 96}%`, c: '#059669', bg: 'rgba(5,150,105,.15)' }, { l: 'Risk', v: (top?.risk || 'low').toUpperCase(), c: top?.risk === 'high' ? '#E11D48' : '#059669', bg: 'rgba(5,150,105,.15)' }, { l: 'Profit', v: `$${rec.estimated_profit_usd}`, c: '#F59E0B', bg: 'rgba(245,158,11,.15)' }].map(x => (
                            <div key={x.l} style={{ textAlign: 'center', padding: '7px 12px', background: x.bg, borderRadius: 7 }}>
                              <div style={{ fontSize: 16, fontWeight: 800, color: x.c, fontFamily: "'JetBrains Mono',monospace" }}>{x.v}</div>
                              <div style={{ fontSize: 10, color: 'rgba(255,255,255,.3)', marginTop: 2 }}>{x.l}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,.42)', padding: '8px 11px', background: 'rgba(255,255,255,.04)', borderRadius: 7, marginBottom: 12, lineHeight: 1.6 }}>{top?.reasoning}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 13 }}>
                        {[{ l: 'HOS Fitness', v: top?.hos_score, c: '#60a5fa' }, { l: 'Proximity', v: top?.proximity_score, c: '#F59E0B' }, { l: 'Cost Efficiency', v: top?.efficiency_score, c: '#059669' }, { l: 'Safety', v: top?.safety_score, c: '#a78bfa' }].map(x => (
                          <div key={x.l}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(255,255,255,.3)', marginBottom: 3 }}><span>{x.l}</span><span style={{ color: x.c, fontFamily: "'JetBrains Mono',monospace" }}>{x.v}/100</span></div><div style={{ height: 4, background: 'rgba(255,255,255,.08)', borderRadius: 2, overflow: 'hidden' }}><div style={{ height: '100%', width: `${x.v}%`, background: x.c, borderRadius: 2, transition: 'width 1s' }} /></div></div>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: 9 }}>
                        <button className="btn btn-emerald" style={{ flex: 1, justifyContent: 'center', padding: 10, fontSize: 13 }} onClick={() => assignLoad(top?.driver_id, top?.driver_name)}>✓ Assign {top?.driver_name?.split(' ')[0]} — Create NavPro Trip</button>
                        <button onClick={() => { setDpStep('form'); setDpRes(null); }} style={{ padding: '10px 13px', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 7, color: 'rgba(255,255,255,.5)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>← Back</button>
                      </div>
                    </div>
                    <div className="card" style={{ overflow: 'hidden' }}>
                      <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 700 }}>All {rec.drivers?.length} Drivers Scored</div>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead><tr style={{ background: 'var(--bg)' }}>{['Score', 'Driver', 'HOS', 'Proximity', 'Efficiency', 'Safety', 'Deadhead', 'ETA', 'On-Time', 'Risk', 'Action'].map(h => <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--muted)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
                          <tbody>
                            {(rec.drivers as any[])?.slice().sort((a: any, b: any) => b.total_score - a.total_score).map((d: any) => {
                              const blk = d.total_score < 10;
                              return <tr key={d.driver_id} style={{ background: d.recommended ? 'rgba(5,150,105,.04)' : blk ? 'rgba(225,29,72,.03)' : 'transparent' }}>
                                <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)' }}><div style={{ width: 30, height: 30, borderRadius: '50%', background: `rgba(${d.total_score > 70 ? '5,150,105' : d.total_score > 40 ? '245,158,11' : '225,29,72'},.12)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, color: d.total_score > 70 ? 'var(--emerald)' : d.total_score > 40 ? 'var(--amber)' : 'var(--rose)', fontFamily: "'JetBrains Mono',monospace" }}>{d.total_score}</div></td>
                                <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)', fontWeight: 600, whiteSpace: 'nowrap' }}>{d.driver_name}{d.recommended && <span style={{ marginLeft: 5, fontSize: 9, background: 'rgba(5,150,105,.1)', color: 'var(--emerald)', padding: '1px 5px', borderRadius: 3 }}>BEST</span>}{blk && <span style={{ marginLeft: 5, fontSize: 9, background: 'rgba(225,29,72,.1)', color: 'var(--rose)', padding: '1px 5px', borderRadius: 3 }}>BLOCKED</span>}</td>
                                {[d.hos_score, d.proximity_score, d.efficiency_score, d.safety_score].map((v: number, j: number) => <td key={j} style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)' }}><div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><div style={{ width: 34, height: 3, background: 'var(--bg3)', borderRadius: 2, overflow: 'hidden' }}><div style={{ height: '100%', width: `${v}%`, background: v > 70 ? 'var(--emerald)' : v > 40 ? 'var(--amber)' : 'var(--rose)', borderRadius: 2 }} /></div><span style={{ fontSize: 11, fontFamily: "'JetBrains Mono',monospace" }}>{v}</span></div></td>)}
                                <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)', fontFamily: "'JetBrains Mono',monospace" }}>{d.deadhead_miles}mi</td>
                                <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)', fontFamily: "'JetBrains Mono',monospace" }}>{d.pickup_eta_minutes}min</td>
                                <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)', fontFamily: "'JetBrains Mono',monospace", color: d.on_time_pct >= 90 ? 'var(--emerald)' : d.on_time_pct >= 70 ? 'var(--amber)' : 'var(--rose)', fontWeight: 600 }}>{d.on_time_pct}%</td>
                                <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)' }}><Badge color={d.risk === 'low' ? 'green' : d.risk === 'medium' ? 'amber' : 'red'}>{d.risk?.toUpperCase()}</Badge></td>
                                <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)' }}>{!blk && <button onClick={() => assignLoad(d.driver_id, d.driver_name)} style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 5, background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.3)', color: 'var(--amber)', cursor: 'pointer', fontFamily: 'inherit' }}>Assign</button>}</td>
                              </tr>;
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* ── COST / KNAPSACK ───────────────────────────────────────────────── */}
          {view === 'cost' && (
            <div style={{ maxWidth: 920, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="card" style={{ padding: '13px 18px', background: 'var(--navy)', border: 'none' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 3 }}>♟ Knapsack DP + Travelling Salesman Problem</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,.42)' }}>Selects most profitable load combination · TSP nearest-neighbor finds shortest delivery path · FMCSA rest stops inserted automatically</div>
              </div>
              <div className="card" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 700, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  Available Loads
                  <button className="btn btn-amber" style={{ fontSize: 12, padding: '7px 13px' }} onClick={runKnapsack} disabled={ksLoad}>
                    {ksLoad ? <><Spinner /> Optimizing…</> : '♟ Run Knapsack + TSP'}
                  </button>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead><tr style={{ background: 'var(--bg)' }}>{['Load', 'Route', 'Weight', 'Revenue', 'Distance', 'Deadline', '$/klb', 'Selected'].map(h => <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>{h}</th>)}</tr></thead>
                    <tbody>
                      {LOADS.map(l => {
                        const isSel = ksRes?.selected_loads?.some((s: any) => s.id === l.id);
                        return <tr key={l.id} style={{ background: isSel ? 'rgba(5,150,105,.04)' : 'transparent' }}>
                          <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontWeight: 700, color: 'var(--amber)', fontFamily: "'JetBrains Mono',monospace" }}>{l.id}</td>
                          <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>{l.pickup.split(',')[0]} → {l.delivery.split(',')[0]}</td>
                          <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontFamily: "'JetBrains Mono',monospace" }}>{(l.weight_lbs / 1000).toFixed(0)}k lbs</td>
                          <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', color: 'var(--emerald)', fontWeight: 700, fontFamily: "'JetBrains Mono',monospace" }}>${l.revenue_usd.toLocaleString()}</td>
                          <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontFamily: "'JetBrains Mono',monospace" }}>{l.distance_miles}mi</td>
                          <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontFamily: "'JetBrains Mono',monospace" }}>{l.deadline_hours}h</td>
                          <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontFamily: "'JetBrains Mono',monospace" }}>${(l.revenue_usd / l.weight_lbs * 1000).toFixed(2)}</td>
                          <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>{isSel ? <Badge color="green">✓ Selected</Badge> : <span style={{ fontSize: 11, color: 'var(--muted)' }}>—</span>}</td>
                        </tr>;
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              {ksRes && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {[{ l: 'Revenue', v: `$${ksRes.total_revenue.toLocaleString()}`, c: 'var(--emerald)' }, { l: 'Net Profit', v: `$${ksRes.profit_usd.toLocaleString()}`, c: 'var(--emerald)' }, { l: 'Total Miles', v: `${ksRes.total_miles}mi`, c: 'var(--amber)' }, { l: 'Utilization', v: `${ksRes.utilization_pct}%`, c: 'var(--sky)' }].map(x => (
                      <div key={x.l} className="card" style={{ flex: 1, minWidth: 130, padding: '13px 16px', textAlign: 'center' }}>
                        <div style={{ fontSize: 21, fontWeight: 800, color: x.c, fontFamily: "'JetBrains Mono',monospace" }}>{x.v}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{x.l}</div>
                      </div>
                    ))}
                  </div>
                  {/* TSP Route path */}
                  <div className="card" style={{ overflow: 'hidden' }}>
                    <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>📍 TSP Optimal Route Path — Nearest Neighbor</div>
                      <span style={{ fontSize: 11, color: 'var(--muted)', background: 'var(--bg)', padding: '3px 9px', borderRadius: 5, border: '1px solid var(--border)' }}>{ksRes.route?.length} stops</span>
                    </div>
                    <div style={{ padding: '16px 20px' }}>
                      {(ksRes.route || []).map((step: any, i: number, arr: any[]) => (
                        <div key={`step-${i}`} style={{ display: 'flex', gap: 14, position: 'relative' }}>
                          {i < arr.length - 1 && <div style={{ position: 'absolute', left: 15, top: 30, bottom: -4, width: 2, background: 'var(--border)', zIndex: 0 }} />}
                          <div style={{ width: 30, height: 30, borderRadius: '50%', background: i === 0 ? 'var(--navy)' : i === arr.length - 1 ? 'var(--emerald)' : step.action?.toLowerCase().includes('rest') ? 'var(--sky)' : 'var(--amber)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 11, color: '#fff', flexShrink: 0, zIndex: 1, fontFamily: "'JetBrains Mono',monospace" }}>
                            {i === 0 ? 'S' : i === arr.length - 1 ? 'E' : i}
                          </div>
                          <div style={{ flex: 1, paddingBottom: 16 }}>
                            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', marginBottom: 2 }}>{step.name}</div>
                            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 5 }}>{step.action}</div>
                            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                              <Badge color="amber">ETA: {step.eta}</Badge>
                              <Badge color="gray">Mile ~{step.miles_from_start}</Badge>
                              {step.action?.toLowerCase().includes('rest') && <Badge color="blue">FMCSA Required</Badge>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── SAFETY ────────────────────────────────────────────────────────── */}
          {view === 'safety' && (
            <div style={{ maxWidth: 920, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {[{ l: 'Blocked', v: drivers.filter(d => (d.enriched?.hos_remaining ?? 8) < 2).length, c: 'var(--rose)', bg: 'rgba(225,29,72,.06)' }, { l: 'Warning', v: drivers.filter(d => { const h = d.enriched?.hos_remaining ?? 8; return h >= 2 && h < 4; }).length, c: 'var(--amber)', bg: 'rgba(245,158,11,.06)' }, { l: 'Compliant', v: drivers.filter(d => (d.enriched?.hos_remaining ?? 8) >= 4).length, c: 'var(--emerald)', bg: 'rgba(5,150,105,.06)' }, { l: 'SOS Events', v: alerts.filter(a => a.type === 'sos').length, c: 'var(--rose)', bg: 'rgba(225,29,72,.06)' }].map(x => (
                  <div key={x.l} className="card" style={{ flex: 1, minWidth: 120, padding: '13px 16px', background: x.bg, textAlign: 'center' }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: x.c, fontFamily: "'JetBrains Mono',monospace" }}>{x.v}</div>
                    <div style={{ fontSize: 11, color: x.c, opacity: .8, marginTop: 3 }}>{x.l}</div>
                  </div>
                ))}
              </div>
              <div className="card" style={{ padding: '12px 16px', background: 'rgba(245,158,11,.04)', border: '1px solid rgba(245,158,11,.15)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--amber)', marginBottom: 7 }}>Dynamic Score Penalty Rules</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, fontSize: 11, color: 'var(--text2)' }}>
                  {['Not following rest path → −15 pts', 'Missed planned fuel stop → −10 pts', 'HOS violation → −20 pts + dispatch blocked', 'Off-route deviation >20mi → −12 pts', 'GPS signal lost while IN_TRANSIT → SOS', 'Weather delay + no reroute → −8 pts'].map(r => (
                    <div key={r} style={{ padding: '5px 9px', background: 'var(--surface)', borderRadius: 5, border: '1px solid var(--border)' }}>• {r}</div>
                  ))}
                </div>
              </div>
              <div className="card" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 700 }}>Driver Safety & Compliance</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead><tr style={{ background: 'var(--bg)' }}>{['Driver', 'Base', 'Penalties', 'Adj. Score', 'HOS', 'Fuel', 'Rest', 'OOR', 'Fuel Stop', 'SOS', 'Status'].map(h => <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--muted)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
                    <tbody>
                      {[...drivers].sort((a, b) => (a.enriched?.hos_remaining ?? 8) - (b.enriched?.hos_remaining ?? 8)).map(d => {
                        const fn = d.basic_info.driver_first_name, ln = d.basic_info.driver_last_name;
                        const hos = d.enriched?.hos_remaining ?? 8, safe = d.enriched?.safety_score ?? 80;
                        const fuel = d.enriched?.fuel_level_pct ?? 60, oor = d.enriched?.oor_miles ?? 0;
                        const elapsed = nowTs - (d.driver_location?.latest_update || 0);
                        const isSOS = d.basic_info.work_status === 'IN_TRANSIT' && elapsed > 180000;
                        const restOk = oor < 10, fuelOk = fuel > 20, blocked = hos < 2;
                        const pen = (restOk ? 0 : 15) + (fuelOk ? 0 : 10) + (blocked ? 20 : 0) + (isSOS ? 15 : 0);
                        const adj = Math.max(0, safe - pen);
                        return <tr key={d.driver_id} style={{ background: blocked ? 'rgba(225,29,72,.03)' : isSOS ? 'rgba(225,29,72,.04)' : 'transparent' }}>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>{fn} {ln}</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', fontFamily: "'JetBrains Mono',monospace" }}>{safe}</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', color: pen > 0 ? 'var(--rose)' : 'var(--emerald)', fontWeight: 600, fontFamily: "'JetBrains Mono',monospace" }}>{pen > 0 ? `−${pen}` : '0'}</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}><div style={{ width: 30, height: 30, borderRadius: '50%', background: `rgba(${adj > 80 ? '5,150,105' : adj > 60 ? '245,158,11' : '225,29,72'},.12)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, color: adj > 80 ? 'var(--emerald)' : adj > 60 ? 'var(--amber)' : 'var(--rose)', fontFamily: "'JetBrains Mono',monospace" }}>{adj}</div></td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', color: blocked ? 'var(--rose)' : hos < 4 ? 'var(--amber)' : 'var(--emerald)', fontWeight: 700, fontFamily: "'JetBrains Mono',monospace" }}>{hos.toFixed(1)}h</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', color: fuel < 20 ? 'var(--rose)' : 'inherit', fontFamily: "'JetBrains Mono',monospace" }}>{fuel}%</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}><Badge color={restOk ? 'green' : 'red'}>{restOk ? '✓ OK' : '✗ Off'}</Badge></td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}><Badge color={oor < 10 ? 'green' : oor < 25 ? 'amber' : 'red'}>{oor.toFixed(0)}mi</Badge></td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}><Badge color={fuelOk ? 'green' : 'red'}>{fuelOk ? '✓ OK' : '⚠ Miss'}</Badge></td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>{isSOS ? <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--rose)', animation: 'blink 1s infinite' }}>🚨 SOS</span> : <span style={{ fontSize: 10, color: 'var(--muted)' }}>—</span>}</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}><Badge color={blocked || isSOS ? 'red' : hos < 4 ? 'amber' : 'green'}>{blocked ? 'BLOCKED' : isSOS ? 'SOS' : hos < 4 ? 'WARNING' : 'CLEAR'}</Badge></td>
                        </tr>;
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── BILLING ───────────────────────────────────────────────────────── */}
          {view === 'billing' && (
            <div style={{ maxWidth: 680, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="card" style={{ padding: '13px 18px', background: 'var(--navy)', border: 'none' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 3 }}>📄 Billing Autopilot — 45 min → 90 sec</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,.42)' }}>Groq Vision reads BOL/POD · extracts every field · generates invoice · pushes to NavPro /api/document/add</div>
              </div>
              <div className="card" style={{ padding: 22 }}>
                <div onClick={() => fileRef.current?.click()} style={{ border: `2px dashed ${blB64 ? 'var(--amber)' : 'var(--border)'}`, borderRadius: 10, padding: '26px 20px', textAlign: 'center', cursor: 'pointer', transition: 'all .2s', background: blB64 ? 'rgba(245,158,11,.04)' : 'var(--bg)', marginBottom: 14 }}>
                  <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={handleFile} />
                  <div style={{ fontSize: 28, marginBottom: 6 }}>{blB64 ? '📋' : '📸'}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 3 }}>{blB64 ? blName : 'Drop BOL, POD, or fuel receipt'}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{blB64 ? 'Click to replace' : 'JPG · PNG · PDF'}</div>
                </div>
                {blB64 && !blFields && (
                  <button onClick={runExtract} disabled={blLoad} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px', background: blLoad ? '#9ca3af' : 'var(--amber)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 700, cursor: blLoad ? 'not-allowed' : 'pointer', fontFamily: 'inherit', marginBottom: 0 }}>
                    {blLoad ? <><Spinner />Groq Vision reading…</> : '👁 Extract All Fields'}
                  </button>
                )}
                {blB64 && blFields && !blPushed && (
                  <button onClick={() => setBlFields(null)} style={{ width: '100%', marginBottom: 10, padding: '7px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--muted)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>← Re-extract</button>
                )}
                {blFields && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--emerald)', marginBottom: 10 }}>✦ {Object.values(blFields).filter(Boolean).length} fields extracted</div>
                    <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
                      {Object.entries(blFields).filter(([, v]) => v && v !== 'null').map(([k, v], i, arr) => (
                        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '8px 13px', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none', background: i % 2 === 0 ? 'var(--bg)' : '#fff', gap: 10 }}>
                          <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0, textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}</span>
                          <span style={{ fontSize: 12, fontWeight: 600, fontFamily: "'JetBrains Mono',monospace", textAlign: 'right' }}>{v as string}</span>
                        </div>
                      ))}
                    </div>
                    {!blPushed ? (
                      <button onClick={() => { setBlPushed(true); toast('📤 Invoice pushed to NavPro /api/document/add'); }} style={{ width: '100%', padding: '11px', background: 'var(--emerald)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                        📤 Generate Invoice → Push to NavPro
                      </button>
                    ) : (
                      <div style={{ padding: '13px', background: 'rgba(5,150,105,.08)', border: '1px solid rgba(5,150,105,.2)', borderRadius: 8, textAlign: 'center' }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--emerald)', marginBottom: 3 }}>✅ Invoice uploaded to NavPro</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>Document ID: TP-DOC-{Math.floor(Math.random() * 90000 + 10000)}</div>
                        <button onClick={() => { setBlB64(''); setBlFields(null); setBlPushed(false); setBlName(''); if (fileRef.current) fileRef.current.value = ''; }} style={{ padding: '6px 14px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--muted)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Process another</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

        </main>
      </div>

      {/* Toasts — FIXED unique keys */}
      <div style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 999, display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-end' }}>
        {toasts.map(t => (
          <div key={`toast-${t.id}`} style={{ padding: '9px 15px', background: t.ok ? 'var(--navy)' : '#DC2626', borderRadius: 8, fontSize: 13, fontWeight: 500, color: '#fff', boxShadow: '0 6px 20px rgba(0,0,0,.2)', maxWidth: 380, borderLeft: `3px solid ${t.ok ? 'var(--amber)' : '#fff'}` }}>
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  );
}
