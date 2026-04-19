'use client';
// app/components/FleetPanel.tsx
import { Driver } from '../types';

interface FleetPanelProps {
  drivers: Driver[];
  loading: boolean;
  selectedId: number | null;
  onSelect: (d: Driver) => void;
}

const STATUS_COLOR: Record<string, string> = {
  IN_TRANSIT: 'var(--green)',
  AVAILABLE: '#60a5fa',
  OFF_DUTY: 'var(--muted)',
  SLEEPER_BERTH: 'var(--amber)',
};

const DRIVER_COLORS = ['#FF6B35','#00C896','#FFB800','#7C3AED','#1565C0','#FF4757','#00C896'];

export default function FleetPanel({ drivers, loading, selectedId, onSelect }: FleetPanelProps) {
  const active = drivers.filter(d => d.basic_info.work_status === 'IN_TRANSIT').length;
  const available = drivers.filter(d => d.basic_info.work_status === 'AVAILABLE').length;
  const alerts = drivers.filter(d => d.enriched.hos_remaining < 2 || d.enriched.fuel_level_pct < 15).length;
  const avgCpm = drivers.filter(d => d.enriched.cost_per_mile > 0)
    .reduce((s, d, _, a) => s + d.enriched.cost_per_mile / a.length, 0);

  return (
    <aside style={{
      width: 288, flexShrink: 0, background: 'var(--navy2)',
      borderRight: '1px solid var(--border)', display: 'flex',
      flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>
          Fleet Overview
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, padding: '9px 11px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {[
          { v: active, l: 'Active', c: 'var(--green)' },
          { v: available, l: 'Available', c: '#60a5fa' },
          { v: `$${avgCpm.toFixed(2)}`, l: '$/mile avg', c: 'var(--orange)' },
          { v: alerts, l: 'Alerts', c: 'var(--red)' },
        ].map(s => (
          <div key={s.l} style={{ background: 'rgba(255,255,255,.04)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px' }}>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 700, color: s.c, lineHeight: 1 }}>{s.v}</div>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Section label */}
      <div style={{ padding: '8px 12px 4px', flexShrink: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>
          Drivers — click to dispatch
        </div>
      </div>

      {/* Driver list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
            <div style={{ width: 16, height: 16, border: '2px solid var(--border)', borderTopColor: 'var(--orange)', borderRadius: '50%', animation: 'spin .7s linear infinite', margin: '0 auto 8px' }}/>
            Loading fleet from NavPro…
          </div>
        ) : drivers.map((d, i) => {
          const fn = d.basic_info.driver_first_name;
          const ln = d.basic_info.driver_last_name;
          const status = d.basic_info.work_status;
          const hos = d.enriched.hos_remaining;
          const fuel = d.enriched.fuel_level_pct;
          const spd = d.enriched.speed_mph;
          const color = DRIVER_COLORS[i % DRIVER_COLORS.length];
          const hosClass = hos > 5 ? { bg: 'rgba(0,200,150,.15)', c: 'var(--green)' } : hos > 2 ? { bg: 'rgba(255,184,0,.15)', c: 'var(--amber)' } : { bg: 'rgba(255,71,87,.15)', c: 'var(--red)' };
          const origin = d.loads?.driver_current_load?.origin || '';
          const dest = d.loads?.driver_current_load?.destination || '';
          const route = origin ? `${origin} → ${dest}` : 'Available — Idle';
          const isSel = selectedId === d.driver_id;

          return (
            <div
              key={d.driver_id}
              onClick={() => onSelect(d)}
              style={{
                display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px',
                borderBottom: '1px solid var(--border)', cursor: 'pointer',
                transition: 'background .12s',
                background: isSel ? 'rgba(255,107,53,.08)' : 'transparent',
                borderLeft: isSel ? '2px solid var(--orange)' : '2px solid transparent',
              }}
            >
              {/* Avatar */}
              <div style={{
                width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                background: `${color}22`, color, border: `1px solid ${color}44`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700,
              }}>{fn[0]}{ln[0]}</div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: STATUS_COLOR[status] || 'var(--muted)', flexShrink: 0 }}/>
                  {fn} {ln}
                </div>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{route}</div>
                {/* Fuel bar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
                  <span style={{ fontSize: 9, color: 'var(--muted)' }}>⛽</span>
                  <div style={{ flex: 1, height: 2, background: 'rgba(255,255,255,.08)', borderRadius: 1, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${fuel}%`, background: fuel < 20 ? 'var(--red)' : fuel < 35 ? 'var(--amber)' : 'var(--green)', borderRadius: 1, transition: 'width 1s' }}/>
                  </div>
                  <span style={{ fontSize: 9, color: fuel < 20 ? 'var(--red)' : 'var(--muted)', fontFamily: "'DM Mono', monospace" }}>{fuel}%</span>
                </div>
              </div>

              {/* Right */}
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, fontWeight: 500, padding: '2px 5px', borderRadius: 3, background: hosClass.bg, color: hosClass.c }}>{hos.toFixed(1)}h HOS</div>
                <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 2, fontFamily: "'DM Mono', monospace" }}>{spd > 0 ? `${spd} mph` : 'Idle'}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Cost breakdown */}
      <div style={{ borderTop: '1px solid var(--border)', padding: '10px 12px', flexShrink: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>Cost/Mile by Driver</div>
        {[...drivers].filter(d => d.enriched.cost_per_mile > 0).sort((a, b) => b.enriched.cost_per_mile - a.enriched.cost_per_mile).slice(0, 3).map((d, i) => {
          const cpm = d.enriched.cost_per_mile;
          const max = 3.2;
          const pct = Math.min((cpm / max) * 100, 100);
          const c = cpm > 2.5 ? 'var(--red)' : cpm > 2.0 ? 'var(--amber)' : 'var(--green)';
          return (
            <div key={d.driver_id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 2 }}>
                <span style={{ color: 'var(--muted)' }}>{d.basic_info.driver_first_name} {d.basic_info.driver_last_name[0]}.</span>
                <span style={{ fontFamily: "'DM Mono', monospace", color: c }}>${cpm}</span>
              </div>
              <div style={{ height: 3, background: 'rgba(255,255,255,.08)', borderRadius: 2, overflow: 'hidden', marginBottom: 5 }}>
                <div style={{ height: '100%', width: `${pct}%`, background: c, borderRadius: 2, transition: 'width 1s' }}/>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
