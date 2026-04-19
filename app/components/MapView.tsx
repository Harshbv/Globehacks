'use client';
// app/components/MapView.tsx
import { useEffect, useRef, useState } from 'react';
import { Driver } from '../types';

interface MapViewProps {
  drivers: Driver[];
  selectedId: number | null;
  onDriverSelect: (d: Driver) => void;
  gmKey?: string;
}

const DRIVER_COLORS = ['#FF6B35','#00C896','#FFB800','#7C3AED','#1565C0','#FF4757','#00C896','#FF6B35'];

declare global { interface Window { google: any; initDispatchMap: () => void; } }

export default function MapView({ drivers, selectedId, onDriverSelect, gmKey }: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapInstance, setMapInstance] = useState<any>(null);
  const [markers, setMarkers] = useState<any[]>([]);
  const [googleReady, setGoogleReady] = useState(false);
  const [apiKey, setApiKey] = useState(gmKey || '');
  const [showKeyInput, setShowKeyInput] = useState(!gmKey);
  const [filter, setFilter] = useState<'all' | 'transit' | 'alert'>('all');

  // Load Google Maps
  const loadGoogleMaps = (key: string) => {
    if (window.google) { initMap(key); return; }
    window.initDispatchMap = () => { setGoogleReady(true); };
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&callback=initDispatchMap`;
    script.async = true;
    script.onerror = () => alert('Google Maps API key invalid or Maps JavaScript API not enabled');
    document.head.appendChild(script);
  };

  const initMap = (key?: string) => {
    if (!mapRef.current || !window.google) return;
    const map = new window.google.maps.Map(mapRef.current, {
      center: { lat: 33.4484, lng: -112.074 },
      zoom: 7,
      mapTypeId: 'roadmap',
      disableDefaultUI: false,
      zoomControl: true,
      styles: [
        { elementType: 'geometry', stylers: [{ color: '#0A1628' }] },
        { elementType: 'labels.text.fill', stylers: [{ color: '#8BAACF' }] },
        { elementType: 'labels.text.stroke', stylers: [{ color: '#0A1628' }] },
        { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#162a4a' }] },
        { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#1e3a5f' }] },
        { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#8BAACF' }] },
        { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#071020' }] },
        { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4a6fa5' }] },
        { featureType: 'poi', stylers: [{ visibility: 'off' }] },
        { featureType: 'transit', stylers: [{ visibility: 'off' }] },
        { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#1e3a5f' }] },
        { featureType: 'administrative.land_parcel', elementType: 'labels.text.fill', stylers: [{ color: '#64748b' }] },
      ],
    });
    setMapInstance(map);
  };

  useEffect(() => {
    if (googleReady) initMap();
  }, [googleReady]);

  // Update markers when drivers change
  useEffect(() => {
    if (!mapInstance || !window.google) return;
    markers.forEach(m => m.marker.setMap(null));
    const newMarkers: any[] = [];

    const filtered = filter === 'all' ? drivers
      : filter === 'transit' ? drivers.filter(d => d.basic_info.work_status === 'IN_TRANSIT')
      : drivers.filter(d => d.enriched.hos_remaining < 2 || d.enriched.fuel_level_pct < 20);

    filtered.forEach((d, i) => {
      if (!d.enriched?.lat) return;
      const color = DRIVER_COLORS[i % DRIVER_COLORS.length];
      const isAlert = d.enriched.hos_remaining < 2 || d.enriched.fuel_level_pct < 20;
      const isSelected = selectedId === d.driver_id;

      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
        ${isSelected ? `<circle cx="18" cy="18" r="17" fill="${color}" opacity="0.3"/>` : ''}
        <circle cx="18" cy="18" r="${isAlert ? 13 : 11}" fill="${isAlert ? '#FF4757' : color}"/>
        ${isAlert ? '<circle cx="18" cy="18" r="13" fill="none" stroke="#FF4757" stroke-width="2" stroke-dasharray="4,2" opacity="0.6"/>' : ''}
        <text x="18" y="22" text-anchor="middle" fill="white" font-size="9" font-weight="700" font-family="Inter">T${i + 1}</text>
      </svg>`;

      const marker = new window.google.maps.Marker({
        position: { lat: d.enriched.lat, lng: d.enriched.lng },
        map: mapInstance,
        icon: {
          url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
          scaledSize: new window.google.maps.Size(36, 36),
          anchor: new window.google.maps.Point(18, 18),
        },
        title: `${d.basic_info.driver_first_name} ${d.basic_info.driver_last_name}`,
        zIndex: isSelected ? 1000 : isAlert ? 900 : 100,
      });

      const infoContent = `
        <div style="background:#0F2040;color:white;padding:12px 14px;border-radius:10px;font-family:Inter,sans-serif;min-width:190px;border:1px solid rgba(255,255,255,0.12);">
          <div style="font-size:13px;font-weight:700;margin-bottom:6px;">${d.basic_info.driver_first_name} ${d.basic_info.driver_last_name}</div>
          <div style="font-size:10px;color:#8BAACF;margin-bottom:3px;">📍 ${d.driver_location?.last_known_location || 'Location updating…'}</div>
          ${d.loads?.driver_current_load ? `<div style="font-size:10px;color:#8BAACF;margin-bottom:3px;">🚛 ${d.loads.driver_current_load.origin} → ${d.loads.driver_current_load.destination}</div>` : ''}
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px;">
            <div style="background:rgba(255,255,255,0.05);border-radius:5px;padding:5px 7px;">
              <div style="font-size:9px;color:#8BAACF;">HOS</div>
              <div style="font-size:12px;font-weight:700;color:${d.enriched.hos_remaining < 2 ? '#FF4757' : d.enriched.hos_remaining < 4 ? '#FFB800' : '#00C896'};font-family:'DM Mono',monospace;">${d.enriched.hos_remaining.toFixed(1)}h</div>
            </div>
            <div style="background:rgba(255,255,255,0.05);border-radius:5px;padding:5px 7px;">
              <div style="font-size:9px;color:#8BAACF;">Fuel</div>
              <div style="font-size:12px;font-weight:700;color:${d.enriched.fuel_level_pct < 20 ? '#FF4757' : '#FFB800'};font-family:'DM Mono',monospace;">${d.enriched.fuel_level_pct}%</div>
            </div>
            <div style="background:rgba(255,255,255,0.05);border-radius:5px;padding:5px 7px;">
              <div style="font-size:9px;color:#8BAACF;">Speed</div>
              <div style="font-size:12px;font-weight:700;font-family:'DM Mono',monospace;">${d.enriched.speed_mph > 0 ? d.enriched.speed_mph + ' mph' : 'Idle'}</div>
            </div>
            <div style="background:rgba(255,255,255,0.05);border-radius:5px;padding:5px 7px;">
              <div style="font-size:9px;color:#8BAACF;">$/mile</div>
              <div style="font-size:12px;font-weight:700;font-family:'DM Mono',monospace;">$${d.enriched.cost_per_mile}</div>
            </div>
          </div>
          ${isAlert ? '<div style="margin-top:8px;padding:5px 8px;background:rgba(255,71,87,.15);border-radius:5px;font-size:10px;color:#FF4757;font-weight:600;">⚠ Alert — requires attention</div>' : ''}
        </div>`;

      const infoWindow = new window.google.maps.InfoWindow({ content: infoContent, maxWidth: 220 });
      marker.addListener('click', () => {
        newMarkers.forEach(m => m.infoWindow.close());
        infoWindow.open(mapInstance, marker);
        onDriverSelect(d);
      });

      newMarkers.push({ marker, infoWindow, driver_id: d.driver_id });
    });

    setMarkers(newMarkers);
  }, [mapInstance, drivers, selectedId, filter]);

  // Focus on selected driver
  useEffect(() => {
    if (!mapInstance || selectedId === null) return;
    const d = drivers.find(dr => dr.driver_id === selectedId);
    if (d?.enriched?.lat) {
      mapInstance.panTo({ lat: d.enriched.lat, lng: d.enriched.lng });
      mapInstance.setZoom(10);
    }
  }, [selectedId, mapInstance]);

  return (
    <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Map controls overlay */}
      <div style={{ position: 'absolute', top: 10, left: 10, right: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', pointerEvents: 'none', zIndex: 50 }}>
        {/* Search */}
        <div style={{ background: 'var(--navy2)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 11px', display: 'flex', alignItems: 'center', gap: 7, pointerEvents: 'all', width: 220, boxShadow: '0 4px 20px rgba(0,0,0,.5)' }}>
          <span style={{ color: 'var(--muted)', fontSize: 13 }}>🔍</span>
          <input
            type="text"
            placeholder="Search driver or location…"
            style={{ background: 'none', border: 'none', outline: 'none', color: '#fff', fontSize: 12, width: '100%', fontFamily: 'inherit' }}
          />
        </div>

        {/* Filter buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, pointerEvents: 'all' }}>
          {(['all', 'transit', 'alert'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                background: filter === f ? 'var(--orange)' : 'var(--navy2)',
                border: `1px solid ${filter === f ? 'var(--orange)' : 'var(--border)'}`,
                borderRadius: 6, padding: '6px 11px', fontSize: 11, fontWeight: 500,
                color: '#fff', cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,0,0,.4)',
                transition: 'all .15s', fontFamily: 'inherit',
              }}
            >
              {f === 'all' ? '🚛 All Trucks' : f === 'transit' ? '▶ In Transit' : '⚠ Alerts Only'}
            </button>
          ))}
        </div>
      </div>

      {/* Google Maps container */}
      {googleReady ? (
        <div ref={mapRef} style={{ flex: 1, width: '100%' }}/>
      ) : (
        // Demo SVG map fallback
        <DemoMap drivers={drivers} selectedId={selectedId} onDriverSelect={onDriverSelect} filter={filter} setFilter={setFilter}/>
      )}

      {/* Google Maps key input */}
      {showKeyInput && !googleReady && (
        <div style={{
          position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)', zIndex: 20,
          background: 'var(--navy2)', border: '1px solid var(--border)', borderRadius: 10,
          padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10,
          boxShadow: '0 8px 32px rgba(0,0,0,.6)',
        }}>
          <span style={{ fontSize: 13, color: 'var(--muted)', whiteSpace: 'nowrap' }}>🗺️ Google Maps</span>
          <input
            type="text"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="Paste Google Maps API key for live satellite view…"
            style={{ background: 'rgba(255,255,255,.05)', border: '1px solid var(--border)', borderRadius: 5, padding: '6px 10px', color: '#fff', fontSize: 11, fontFamily: "'DM Mono', monospace", outline: 'none', width: 280 }}
            onKeyDown={e => e.key === 'Enter' && apiKey && loadGoogleMaps(apiKey)}
          />
          <button
            onClick={() => apiKey && loadGoogleMaps(apiKey)}
            style={{ padding: '6px 12px', borderRadius: 5, background: 'var(--orange)', border: 'none', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
          >Activate →</button>
          <button onClick={() => setShowKeyInput(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>
      )}
    </div>
  );
}

// ─── Demo SVG Map (no API key needed) ────────────────────────────────────────
function DemoMap({ drivers, selectedId, onDriverSelect, filter, setFilter }: any) {
  const filtered = filter === 'all' ? drivers
    : filter === 'transit' ? drivers.filter((d: Driver) => d.basic_info.work_status === 'IN_TRANSIT')
    : drivers.filter((d: Driver) => d.enriched.hos_remaining < 2 || d.enriched.fuel_level_pct < 20);

  const positions = [
    [115, 90], [290, 195], [430, 218], [195, 310],
    [548, 65], [78, 230], [330, 150], [480, 300],
  ];

  return (
    <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '56px 16px 16px', background: 'var(--navy3)' }}>
      <svg viewBox="0 0 700 380" width="100%" style={{ maxHeight: 'calc(100vh - 200px)', borderRadius: 10, border: '1px solid var(--border)' }}>
        <defs>
          <pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse">
            <path d="M34 0L0 0 0 34" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1"/>
          </pattern>
        </defs>
        <rect width="700" height="380" fill="#0F2040"/>
        <rect width="700" height="380" fill="url(#grid)"/>

        {/* Highways */}
        <line x1="0" y1="190" x2="700" y2="190" stroke="rgba(255,255,255,0.08)" strokeWidth="8"/>
        <line x1="350" y1="0" x2="350" y2="380" stroke="rgba(255,255,255,0.07)" strokeWidth="6"/>
        <line x1="0" y1="95" x2="700" y2="270" stroke="rgba(255,255,255,0.05)" strokeWidth="4"/>
        <line x1="110" y1="0" x2="560" y2="380" stroke="rgba(255,255,255,0.04)" strokeWidth="3"/>
        <line x1="0" y1="300" x2="700" y2="80" stroke="rgba(255,255,255,0.04)" strokeWidth="3"/>

        {/* Highway labels */}
        <text x="340" y="186" fill="rgba(255,255,255,0.15)" fontSize="9" fontFamily="Inter">I-10</text>
        <text x="354" y="100" fill="rgba(255,255,255,0.15)" fontSize="9" fontFamily="Inter">I-17</text>
        <text x="30" y="82" fill="rgba(139,170,207,0.45)" fontSize="10" fontFamily="Inter">Phoenix, AZ</text>
        <text x="596" y="22" fill="rgba(139,170,207,0.45)" fontSize="10" fontFamily="Inter">Albuquerque, NM</text>
        <text x="30" y="372" fill="rgba(139,170,207,0.45)" fontSize="10" fontFamily="Inter">Tucson, AZ</text>
        <text x="582" y="372" fill="rgba(139,170,207,0.45)" fontSize="10" fontFamily="Inter">El Paso, TX</text>
        <text x="308" y="205" fill="rgba(139,170,207,0.3)" fontSize="10" fontFamily="Inter">Flagstaff, AZ</text>

        {/* Route trails */}
        {filtered.slice(0, 6).map((_: any, i: number) => (
          <path key={i} d={`M${positions[i]?.[0] || 100},${positions[i]?.[1] || 100} Q${200 + i*40},${150 + i*20} ${350 + i*30},${200}`}
            stroke={`rgba(${i % 2 === 0 ? '255,107,53' : '0,200,150'},0.25)`}
            strokeWidth="2" fill="none" strokeDasharray="5,3"/>
        ))}

        {/* Driver markers */}
        {filtered.map((d: Driver, i: number) => {
          const [cx, cy] = positions[i] || [200 + i * 60, 200];
          const color = DRIVER_COLORS[i % DRIVER_COLORS.length];
          const isAlert = d.enriched.hos_remaining < 2 || d.enriched.fuel_level_pct < 20;
          const isSel = selectedId === d.driver_id;
          return (
            <g key={d.driver_id} onClick={() => onDriverSelect(d)} style={{ cursor: 'pointer' }}>
              {isSel && <circle cx={cx} cy={cy} r={20} fill={color} opacity={0.2}/>}
              {isAlert && <circle cx={cx} cy={cy} r={14} fill="none" stroke="#FF4757" strokeWidth="2" strokeDasharray="4,2" opacity={0.7}/>}
              <circle cx={cx} cy={cy} r={10} fill={isAlert ? '#FF4757' : color}/>
              <text x={cx} y={cy + 4} textAnchor="middle" fill="white" fontSize="9" fontWeight="700" fontFamily="Inter">
                {d.basic_info.driver_first_name[0]}{i + 1}
              </text>
              {/* HOS indicator */}
              <text x={cx + 13} y={cy - 8} fill={d.enriched.hos_remaining < 2 ? '#FF4757' : 'rgba(139,170,207,0.8)'} fontSize="8" fontFamily="DM Mono">
                {d.enriched.hos_remaining.toFixed(0)}h
              </text>
            </g>
          );
        })}

        {/* Legend */}
        <rect x="8" y="348" width="230" height="26" rx="5" fill="rgba(10,22,40,0.9)"/>
        <circle cx="22" cy="361" r="5" fill="var(--orange)"/>
        <text x="31" y="365" fill="#8BAACF" fontSize="9" fontFamily="Inter">HOS Warning</text>
        <circle cx="98" cy="361" r="5" fill="#00C896"/>
        <text x="107" y="365" fill="#8BAACF" fontSize="9" fontFamily="Inter">In Transit</text>
        <circle cx="160" cy="361" r="5" fill="#FF4757"/>
        <text x="169" y="365" fill="#8BAACF" fontSize="9" fontFamily="Inter">Alert</text>

        {/* Demo badge */}
        <rect x="560" y="348" width="132" height="22" rx="4" fill="rgba(255,184,0,0.1)" stroke="rgba(255,184,0,0.3)" strokeWidth="1"/>
        <text x="626" y="363" textAnchor="middle" fill="rgba(255,184,0,0.8)" fontSize="9" fontFamily="Inter">Demo — Add Maps key</text>
      </svg>
    </div>
  );
}
