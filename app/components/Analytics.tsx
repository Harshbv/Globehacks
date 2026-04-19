'use client';
// app/components/Analytics.tsx
import { Driver } from '../types';

interface Props { drivers: Driver[]; }

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div style={{ height: 4, background: 'rgba(255,255,255,.06)', borderRadius: 2, overflow: 'hidden', flex: 1 }}>
      <div style={{ height: '100%', width: `${Math.min((value / max) * 100, 100)}%`, background: color, borderRadius: 2, transition: 'width 1s' }}/>
    </div>
  );
}

function KpiCard({ label, value, sub, color, icon }: { label: string; value: string; sub?: string; color: string; icon: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,.04)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 14 }}>{icon}</span>
        <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em' }}>{label}</span>
      </div>
      <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 24, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export default function Analytics({ drivers }: Props) {
  if (!drivers.length) {
    return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 13 }}>Loading fleet analytics…</div>;
  }

  const active = drivers.filter(d => d.basic_info.work_status === 'IN_TRANSIT');
  const available = drivers.filter(d => d.basic_info.work_status === 'AVAILABLE');
  const cpms = drivers.filter(d => d.enriched.cost_per_mile > 0).map(d => d.enriched.cost_per_mile);
  const avgCpm = cpms.reduce((s, v) => s + v, 0) / (cpms.length || 1);
  const avgHos = drivers.reduce((s, d) => s + d.enriched.hos_remaining, 0) / drivers.length;
  const avgSafety = drivers.reduce((s, d) => s + d.enriched.safety_score, 0) / drivers.length;
  const avgFuel = drivers.reduce((s, d) => s + d.enriched.fuel_level_pct, 0) / drivers.length;
  const hosAlerts = drivers.filter(d => d.enriched.hos_remaining < 2).length;
  const fuelAlerts = drivers.filter(d => d.enriched.fuel_level_pct < 20).length;

  // Simulated weekly revenue (in real app: from NavPro loads)
  const weeklyRevenue = active.length * 2800 + available.length * 400;
  const weeklyProfit  = weeklyRevenue * 0.28;

  const sortedByCpm = [...drivers].filter(d => d.enriched.cost_per_mile > 0).sort((a, b) => b.enriched.cost_per_mile - a.enriched.cost_per_mile);
  const sortedBySafety = [...drivers].sort((a, b) => b.enriched.safety_score - a.enriched.safety_score);

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', background: 'var(--navy)' }}>

      {/* KPI grid */}
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 10 }}>Fleet KPIs — Live</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
        <KpiCard label="Active Loads"   value={String(active.length)} sub={`${available.length} available`}    color="var(--green)"  icon="🚛"/>
        <KpiCard label="Avg $/mile"     value={`$${avgCpm.toFixed(2)}`} sub="fleet average"                    color="var(--orange)" icon="💰"/>
        <KpiCard label="Avg HOS"        value={`${avgHos.toFixed(1)}h`} sub={`${hosAlerts} drivers critical`}  color={avgHos < 4 ? 'var(--red)' : 'var(--amber)'} icon="⏰"/>
        <KpiCard label="Safety Score"   value={`${avgSafety.toFixed(0)}`} sub="fleet average"                 color={avgSafety > 80 ? 'var(--green)' : 'var(--amber)'} icon="🛡"/>
        <KpiCard label="Avg Fuel"       value={`${avgFuel.toFixed(0)}%`} sub={`${fuelAlerts} drivers low`}    color={avgFuel < 25 ? 'var(--red)' : 'var(--amber)'} icon="⛽"/>
        <KpiCard label="Est. Revenue"   value={`$${(weeklyRevenue/1000).toFixed(0)}K`} sub="this week"        color="var(--green)"  icon="📈"/>
      </div>

      {/* Revenue vs Cost bar chart (simulated) */}
      <div style={{ background: 'rgba(255,255,255,.04)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 10, display: 'flex', justifyContent: 'space-between' }}>
          <span>Weekly Revenue vs Cost</span>
          <span style={{ fontSize: 10, color: 'var(--green)', fontFamily: "'DM Mono', monospace" }}>+${(weeklyProfit/1000).toFixed(1)}K profit</span>
        </div>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => {
          const rev = (0.7 + Math.sin(i) * 0.3) * weeklyRevenue / 5;
          const cost = rev * (0.65 + Math.random() * 0.1);
          const maxVal = weeklyRevenue / 3;
          return (
            <div key={day} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ width: 28, fontSize: 10, color: 'var(--muted)', textAlign: 'right', flexShrink: 0 }}>{day}</span>
              <div style={{ flex: 1, position: 'relative' }}>
                <div style={{ height: 14, background: 'rgba(0,200,150,.15)', borderRadius: 2, overflow: 'hidden', marginBottom: 2 }}>
                  <div style={{ height: '100%', width: `${Math.min((rev / maxVal) * 100, 100)}%`, background: 'var(--green)', borderRadius: 2 }}/>
                </div>
                <div style={{ height: 8, background: 'rgba(255,71,87,.12)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min((cost / maxVal) * 100, 100)}%`, background: 'rgba(255,107,53,.6)', borderRadius: 2 }}/>
                </div>
              </div>
              <span style={{ width: 50, fontSize: 9, color: 'var(--muted)', textAlign: 'right', flexShrink: 0, fontFamily: "'DM Mono', monospace" }}>${(rev/1000).toFixed(1)}K</span>
            </div>
          );
        })}
        <div style={{ display: 'flex', gap: 14, marginTop: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9, color: 'var(--muted)' }}><div style={{ width: 10, height: 4, background: 'var(--green)', borderRadius: 1 }}/>Revenue</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9, color: 'var(--muted)' }}><div style={{ width: 10, height: 4, background: 'rgba(255,107,53,.6)', borderRadius: 1 }}/>Cost</div>
        </div>
      </div>

      {/* Cost per mile leaderboard */}
      <div style={{ background: 'rgba(255,255,255,.04)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 10 }}>Cost/Mile by Driver <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 400 }}>— lower is better</span></div>
        {sortedByCpm.map((d, i) => {
          const cpm = d.enriched.cost_per_mile;
          const color = cpm > 2.5 ? 'var(--red)' : cpm > 2.0 ? 'var(--amber)' : 'var(--green)';
          return (
            <div key={d.driver_id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
              <span style={{ width: 16, fontSize: 10, color: 'var(--muted)', textAlign: 'center', flexShrink: 0 }}>{i + 1}</span>
              <span style={{ width: 90, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>{d.basic_info.driver_first_name} {d.basic_info.driver_last_name[0]}.</span>
              <MiniBar value={cpm} max={3.2} color={color}/>
              <span style={{ width: 36, textAlign: 'right', fontFamily: "'DM Mono', monospace", fontSize: 11, color, flexShrink: 0 }}>${cpm}</span>
            </div>
          );
        })}
      </div>

      {/* Safety leaderboard */}
      <div style={{ background: 'rgba(255,255,255,.04)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 10 }}>Safety Score Ranking <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 400 }}>— higher is better</span></div>
        {sortedBySafety.map((d, i) => {
          const score = d.enriched.safety_score;
          const color = score > 85 ? 'var(--green)' : score > 70 ? 'var(--amber)' : 'var(--red)';
          return (
            <div key={d.driver_id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
              <span style={{ width: 16, fontSize: 10, color: 'var(--muted)', textAlign: 'center', flexShrink: 0 }}>{i + 1}</span>
              <span style={{ width: 90, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>{d.basic_info.driver_first_name} {d.basic_info.driver_last_name[0]}.</span>
              <MiniBar value={score} max={100} color={color}/>
              <span style={{ width: 30, textAlign: 'right', fontFamily: "'DM Mono', monospace", fontSize: 11, color, flexShrink: 0 }}>{score}</span>
            </div>
          );
        })}
      </div>

      {/* HOS status breakdown */}
      <div style={{ background: 'rgba(255,255,255,.04)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 10 }}>HOS Status Breakdown</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          {[
            { l: 'Critical (<2h)', count: drivers.filter(d => d.enriched.hos_remaining < 2).length, c: 'var(--red)', bg: 'rgba(255,71,87,.1)' },
            { l: 'Warning (2-5h)', count: drivers.filter(d => d.enriched.hos_remaining >= 2 && d.enriched.hos_remaining < 5).length, c: 'var(--amber)', bg: 'rgba(255,184,0,.1)' },
            { l: 'Good (>5h)', count: drivers.filter(d => d.enriched.hos_remaining >= 5).length, c: 'var(--green)', bg: 'rgba(0,200,150,.1)' },
          ].map(s => (
            <div key={s.l} style={{ background: s.bg, border: `1px solid ${s.c}44`, borderRadius: 7, padding: '8px 10px', textAlign: 'center' }}>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 800, color: s.c }}>{s.count}</div>
              <div style={{ fontSize: 9, color: s.c, opacity: 0.8, lineHeight: 1.3, marginTop: 2 }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* OOR miles table */}
      <div style={{ background: 'rgba(255,255,255,.04)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4 }}>Out-of-Route Miles (OOR) <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 400 }}>— wasted deadhead</span></div>
        <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 10 }}>From NavPro /api/driver/performance/query</div>
        {drivers.map(d => {
          const oor = d.enriched.oor_miles;
          const eff = d.enriched.efficiency_pct;
          return (
            <div key={d.driver_id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 11 }}>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.basic_info.driver_first_name} {d.basic_info.driver_last_name}</span>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: oor > 20 ? 'var(--red)' : oor > 10 ? 'var(--amber)' : 'var(--green)', width: 55, textAlign: 'right', flexShrink: 0 }}>{oor.toFixed(1)}mi OOR</span>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: eff > 95 ? 'var(--green)' : eff > 88 ? 'var(--amber)' : 'var(--red)', width: 40, textAlign: 'right', flexShrink: 0 }}>{eff}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
