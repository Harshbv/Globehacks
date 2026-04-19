'use client';
// app/components/AlertsPanel.tsx
import { useState } from 'react';
import { Alert, FuelStation } from '../types';

const SEV_CONFIG = {
  critical: { bg: 'rgba(255,71,87,.1)', border: 'rgba(255,71,87,.3)', color: 'var(--red)', dot: '#FF4757' },
  warning:  { bg: 'rgba(255,184,0,.08)', border: 'rgba(255,184,0,.25)', color: 'var(--amber)', dot: '#FFB800' },
  info:     { bg: 'rgba(96,165,250,.07)', border: 'rgba(96,165,250,.2)', color: '#60a5fa', dot: '#60a5fa' },
  ok:       { bg: 'rgba(0,200,150,.07)', border: 'rgba(0,200,150,.2)', color: 'var(--green)', dot: '#00C896' },
};

const SAMPLE_ALERTS: Alert[] = [
  { type: 'hos', severity: 'critical', title: '⏰ HOS Critical — Derek Williams', message: '0.8h HOS remaining. Auto-blocked from dispatch pool. Driver must rest immediately — FMCSA violation imminent if new load assigned.', action: 'Block dispatch + notify driver', time: '2m ago', driver: 'Derek Williams', hos_remaining: 0.8 },
  { type: 'fuel', severity: 'warning', title: '⛽ Low Fuel — James Rivera', message: '22% fuel remaining on I-10 E. Risk of running low before El Paso. Nearest Pilot Travel Center 3.8mi at Exit 162.', action: 'Redirect to fuel stop', time: '9m ago', driver: 'James Rivera', fuel_level_pct: 22, nearest_station: { place_id: 'p1', name: 'Pilot Travel Center', address: 'I-10 Exit 162, Benson AZ', lat: 31.96, lng: -110.29, distance_miles: 3.8, is_truck_stop: true, phone: '(520) 586-3240' } },
  { type: 'weather', severity: 'warning', title: '⛈ Weather Alert — I-40 Corridor', message: 'Thunderstorm warning active near Flagstaff. Wind 48mph, visibility 1.2mi. 3 active loads affected. Consider alternate routing via US-89.', action: 'Reroute affected loads', time: '17m ago' },
  { type: 'deviation', severity: 'info', title: '🗺 Route Deviation — Amy Patel', message: 'Driver is 14mi off planned route on AZ-89. Extra deadhead miles increasing cost. ETA adjusted +22min.', action: 'Contact driver', time: '24m ago', driver: 'Amy Patel' },
  { type: 'safety', severity: 'info', title: '🛡 Safety Score — Kevin Park', message: 'Weekly safety report: Score 96/100. Zero violations. Recommend for high-priority loads.', time: '1h ago', driver: 'Kevin Park' },
];

export default function AlertsPanel() {
  const [alerts] = useState<Alert[]>(SAMPLE_ALERTS);
  const [expanded, setExpanded] = useState<number | null>(0);
  const [checkingDriver, setCheckingDriver] = useState('');
  const [alertForm, setAlertForm] = useState({ driver_name: '', driver_phone: '', lat: '', lng: '', fuel_pct: '', hos: '' });
  const [checkResult, setCheckResult] = useState<any>(null);
  const [checkLoading, setCheckLoading] = useState(false);
  const [tab, setTab] = useState<'feed' | 'check'>('feed');

  const runCheck = async () => {
    if (!alertForm.driver_name) return;
    setCheckLoading(true); setCheckResult(null);
    try {
      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driver_name: alertForm.driver_name,
          driver_phone: alertForm.driver_phone,
          driver_lat: parseFloat(alertForm.lat) || 33.4484,
          driver_lng: parseFloat(alertForm.lng) || -112.074,
          fuel_level_pct: alertForm.fuel_pct ? parseFloat(alertForm.fuel_pct) : undefined,
          hos_remaining: alertForm.hos ? parseFloat(alertForm.hos) : undefined,
        }),
      });
      const data = await res.json();
      setCheckResult(data);
    } catch (e: any) { alert(e.message); }
    setCheckLoading(false);
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Sub-tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {(['feed', 'check'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: '7px 4px', fontSize: 11, fontWeight: 600, textAlign: 'center',
            cursor: 'pointer', color: tab === t ? '#fff' : 'var(--muted)',
            background: 'none', border: 'none',
            borderBottom: `2px solid ${tab === t ? 'var(--orange)' : 'transparent'}`,
            transition: 'all .15s', fontFamily: 'inherit',
          }}>{t === 'feed' ? '📋 Alert Feed' : '🔍 Check Driver'}</button>
        ))}
      </div>

      {tab === 'feed' && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {alerts.map((a, i) => {
            const cfg = SEV_CONFIG[a.severity];
            const isOpen = expanded === i;
            return (
              <div key={i} style={{ borderBottom: '1px solid var(--border)', transition: 'background .12s', cursor: 'pointer' }}
                onClick={() => setExpanded(isOpen ? null : i)}>
                <div style={{ padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.dot, flexShrink: 0, animation: a.severity === 'critical' ? 'blink 1s infinite' : 'none' }}/>
                    <div style={{ fontSize: 11, fontWeight: 700, flex: 1, color: a.severity === 'critical' ? 'var(--red)' : '#fff' }}>{a.title}</div>
                    <div style={{ fontSize: 9, color: 'var(--muted)', fontFamily: "'DM Mono', monospace" }}>{a.time}</div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 4 }}>{isOpen ? '▲' : '▼'}</div>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', lineHeight: 1.5 }}>{a.message.slice(0, isOpen ? 9999 : 80)}{!isOpen && a.message.length > 80 ? '…' : ''}</div>

                  {isOpen && (
                    <div style={{ marginTop: 8, animation: 'slide-up .2s ease' }}>
                      {/* Fuel station info */}
                      {a.nearest_station && (
                        <div style={{ padding: '8px 10px', background: 'rgba(255,184,0,.07)', border: '1px solid rgba(255,184,0,.2)', borderRadius: 7, marginBottom: 8 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--amber)', marginBottom: 5 }}>⛽ Nearest Fuel Stop</div>
                          <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 2 }}>{a.nearest_station.name}</div>
                          <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>📍 {a.nearest_station.address}</div>
                          <div style={{ display: 'flex', gap: 10, marginBottom: 6 }}>
                            <span style={{ fontSize: 10, color: 'var(--muted)' }}>🚛 {a.nearest_station.distance_miles}mi away</span>
                            {a.nearest_station.phone && <span style={{ fontSize: 10, color: '#60a5fa' }}>📞 {a.nearest_station.phone}</span>}
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button style={{ flex: 1, padding: '5px 8px', borderRadius: 5, background: 'var(--amber)', border: 'none', color: 'var(--navy)', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                              📍 Send to Driver
                            </button>
                            {a.nearest_station.phone && (
                              <button style={{ flex: 1, padding: '5px 8px', borderRadius: 5, background: 'rgba(255,255,255,.07)', border: '1px solid var(--border)', color: '#fff', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                                📞 Call Station
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Action */}
                      {a.action && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button style={{ flex: 1, padding: '6px 8px', borderRadius: 5, background: cfg.color === 'var(--red)' ? 'rgba(255,71,87,.15)' : 'rgba(255,107,53,.1)', border: `1px solid ${cfg.border}`, color: cfg.color, fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                            {a.action} →
                          </button>
                          <button style={{ padding: '6px 8px', borderRadius: 5, background: 'rgba(255,255,255,.05)', border: '1px solid var(--border)', color: 'var(--muted)', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit' }}>
                            📱 SMS Driver
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'check' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10, lineHeight: 1.5 }}>
            Check a driver's current conditions — Groq AI analyzes weather, fuel, HOS, and generates proactive alerts.
          </div>
          {[
            { k: 'driver_name', l: 'Driver Name', ph: 'e.g. Marcus Johnson' },
            { k: 'driver_phone', l: 'Phone (for SMS)', ph: '+1 602-555-0101' },
            { k: 'lat', l: 'Latitude', ph: '33.4484' },
            { k: 'lng', l: 'Longitude', ph: '-112.074' },
            { k: 'fuel_pct', l: 'Fuel Level %', ph: '22' },
            { k: 'hos', l: 'HOS Remaining (h)', ph: '3.5' },
          ].map(f => (
            <div key={f.k} style={{ marginBottom: 7 }}>
              <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '.05em' }}>{f.l}</label>
              <input className="input" placeholder={f.ph} value={(alertForm as any)[f.k]} onChange={e => setAlertForm(p => ({ ...p, [f.k]: e.target.value }))}/>
            </div>
          ))}
          <button className="btn-primary" style={{ width: '100%', padding: 8, fontSize: 12, marginBottom: 10 }} onClick={runCheck} disabled={checkLoading || !alertForm.driver_name}>
            {checkLoading ? 'Analyzing…' : '🔍 Run Proactive Check'}
          </button>

          {checkResult && (
            <div style={{ animation: 'slide-up .3s ease' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--green)', marginBottom: 8 }}>
                ✦ {checkResult.alert_count} alert(s) found · {checkResult.critical_count} critical
              </div>
              {checkResult.alerts?.map((a: any, i: number) => {
                const cfg = SEV_CONFIG[a.severity as keyof typeof SEV_CONFIG] || SEV_CONFIG.info;
                return (
                  <div key={i} style={{ padding: '10px 12px', background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 8, marginBottom: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: cfg.color, marginBottom: 4 }}>{a.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 6 }}>{a.message}</div>
                    {a.nearest_station && (
                      <div style={{ fontSize: 11, color: 'var(--amber)', marginBottom: 4 }}>
                        ⛽ {a.nearest_station.name} · {a.nearest_station.distance_miles}mi · {a.nearest_station.phone || 'No phone'}
                      </div>
                    )}
                    {a.sms && <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: 'var(--muted)', padding: '5px 8px', background: 'rgba(255,255,255,.04)', borderRadius: 4 }}>SMS: {a.sms}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
