'use client';
// app/components/CostPanel.tsx
import { useState } from 'react';
import { RouteOptimization } from '../types';

export default function CostPanel() {
  const [tab, setTab] = useState<'route' | 'knapsack'>('route');
  const [routeForm, setRouteForm] = useState({ pickup: '', delivery: '', distance: '', revenue: '', hos: '11', mpg: '6.5', fuel_price: '4.20', weight: '40000' });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  // Knapsack state
  const [loads, setLoads] = useState([
    { id: 'L001', pickup: 'Phoenix, AZ', delivery: 'Dallas, TX', weight_lbs: 38000, revenue_usd: 3200, distance_miles: 1070, deadline_hours: 24, priority: 2 },
    { id: 'L002', pickup: 'Phoenix, AZ', delivery: 'Los Angeles, CA', weight_lbs: 22000, revenue_usd: 1800, distance_miles: 370, deadline_hours: 8, priority: 3 },
    { id: 'L003', pickup: 'Tucson, AZ', delivery: 'Denver, CO', weight_lbs: 41000, revenue_usd: 2900, distance_miles: 840, deadline_hours: 18, priority: 1 },
    { id: 'L004', pickup: 'Flagstaff, AZ', delivery: 'Albuquerque, NM', weight_lbs: 15000, revenue_usd: 980, distance_miles: 180, deadline_hours: 6, priority: 4 },
  ]);
  const [truckCap, setTruckCap] = useState('45000');
  const [driverHos, setDriverHos] = useState('11');
  const [knapsackResult, setKnapsackResult] = useState<any>(null);
  const [kLoading, setKLoading] = useState(false);

  const runRoute = async () => {
    setLoading(true); setResult(null);
    try {
      const res = await fetch('/api/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'single_route',
          pickup: routeForm.pickup, delivery: routeForm.delivery,
          distance_miles: parseFloat(routeForm.distance) || undefined,
          revenue_usd: parseFloat(routeForm.revenue) || 2500,
          driver_hos_remaining: parseFloat(routeForm.hos) || 11,
          truck_mpg: parseFloat(routeForm.mpg) || 6.5,
          fuel_price: parseFloat(routeForm.fuel_price) || 4.20,
          weight_lbs: parseFloat(routeForm.weight) || 40000,
        }),
      });
      const data = await res.json();
      setResult(data);
    } catch (e: any) { alert(e.message); }
    setLoading(false);
  };

  const runKnapsack = async () => {
    setKLoading(true); setKnapsackResult(null);
    try {
      const res = await fetch('/api/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'knapsack',
          available_loads: loads,
          truck_capacity_lbs: parseFloat(truckCap) || 45000,
          driver_hos_remaining: parseFloat(driverHos) || 11,
        }),
      });
      const data = await res.json();
      setKnapsackResult(data);
    } catch (e: any) { alert(e.message); }
    setKLoading(false);
  };

  const opt: RouteOptimization = result?.optimization;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {(['route', 'knapsack'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: '7px 4px', fontSize: 11, fontWeight: 600, textAlign: 'center',
            cursor: 'pointer', color: tab === t ? '#fff' : 'var(--muted)',
            background: 'none', border: 'none',
            borderBottom: `2px solid ${tab === t ? 'var(--orange)' : 'transparent'}`,
            transition: 'all .15s', fontFamily: 'inherit',
          }}>{t === 'route' ? '🛣 Route Optimize' : '♟ Knapsack AI'}</button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>

        {tab === 'route' && (
          <>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10, lineHeight: 1.5 }}>
              Groq AI optimizes the route factoring in HOS rest breaks, fuel stops, toll roads, and FMCSA compliance.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 7, marginBottom: 8 }}>
              {[
                { k: 'pickup', l: 'Pickup', ph: 'Phoenix, AZ' },
                { k: 'delivery', l: 'Delivery', ph: 'Dallas, TX' },
              ].map(f => (
                <div key={f.k}>
                  <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '.05em' }}>{f.l}</label>
                  <input className="input" placeholder={f.ph} value={(routeForm as any)[f.k]} onChange={e => setRouteForm(p => ({ ...p, [f.k]: e.target.value }))}/>
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginBottom: 8 }}>
              {[
                { k: 'distance', l: 'Distance (mi)', ph: 'auto-calc' },
                { k: 'revenue', l: 'Revenue ($)', ph: '2800' },
                { k: 'hos', l: 'Driver HOS (h)', ph: '11' },
                { k: 'mpg', l: 'Truck MPG', ph: '6.5' },
                { k: 'fuel_price', l: 'Fuel ($/gal)', ph: '4.20' },
                { k: 'weight', l: 'Weight (lbs)', ph: '40000' },
              ].map(f => (
                <div key={f.k}>
                  <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '.05em' }}>{f.l}</label>
                  <input className="input" placeholder={f.ph} value={(routeForm as any)[f.k]} onChange={e => setRouteForm(p => ({ ...p, [f.k]: e.target.value }))}/>
                </div>
              ))}
            </div>
            <button className="btn-primary" style={{ width: '100%', padding: 8, fontSize: 12, marginBottom: 12 }} onClick={runRoute} disabled={loading || !routeForm.pickup || !routeForm.delivery}>
              {loading ? 'Optimizing…' : '🛣 Optimize Route'}
            </button>

            {loading && (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--muted)', fontSize: 12 }}>
                <div style={{ width: 24, height: 24, border: '2px solid var(--border)', borderTopColor: 'var(--orange)', borderRadius: '50%', animation: 'spin .7s linear infinite', margin: '0 auto 8px' }}/>
                Groq AI planning route with HOS + fuel stops…
              </div>
            )}

            {opt && (
              <div style={{ animation: 'slide-up .3s ease' }}>
                {/* P&L summary */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
                  {[
                    { l: 'Revenue', v: `$${result?.optimization?.profit_usd ? (opt.total_cost_usd + opt.profit_usd).toFixed(0) : '—'}`, c: 'var(--green)' },
                    { l: 'Total Cost', v: `$${opt.total_cost_usd?.toFixed(0)}`, c: 'var(--red)' },
                    { l: 'Net Profit', v: `$${opt.profit_usd?.toFixed(0)}`, c: opt.profit_usd > 0 ? 'var(--green)' : 'var(--red)' },
                    { l: 'Margin', v: `${opt.margin_pct?.toFixed(0)}%`, c: opt.margin_pct > 20 ? 'var(--green)' : 'var(--amber)' },
                    { l: 'Fuel Cost', v: `$${opt.fuel_cost_usd?.toFixed(0)}`, c: 'var(--amber)' },
                    { l: '$/mile', v: `$${opt.cost_per_mile?.toFixed(2)}`, c: 'var(--muted)' },
                  ].map(c => (
                    <div key={c.l} style={{ background: 'rgba(255,255,255,.04)', border: '1px solid var(--border)', borderRadius: 7, padding: '8px 10px' }}>
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>{c.l}</div>
                      <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 17, fontWeight: 700, color: c.c }}>{c.v}</div>
                    </div>
                  ))}
                </div>

                {/* Route */}
                <div style={{ padding: '8px 10px', background: 'rgba(21,101,192,.08)', border: '1px solid rgba(21,101,192,.2)', borderRadius: 7, marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#60a5fa', marginBottom: 4 }}>🛣 Recommended Route</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>{opt.recommended_route}</div>
                  <div style={{ marginTop: 6, fontSize: 10, color: 'var(--muted)', display: 'flex', gap: 10 }}>
                    <span>📏 {opt.total_miles}mi</span>
                    <span>⏱ {opt.estimated_hours?.toFixed(1)}h</span>
                  </div>
                </div>

                {/* Rest stops */}
                {opt.rest_stops?.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--amber)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.08em' }}>Mandatory Rest Stops (FMCSA)</div>
                    {opt.rest_stops.map((rs, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: 'rgba(255,184,0,.06)', border: '1px solid rgba(255,184,0,.15)', borderRadius: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: 16 }}>😴</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 11, fontWeight: 600 }}>{rs.location}</div>
                          <div style={{ fontSize: 10, color: 'var(--muted)' }}>Mile {rs.miles_from_start} · {rs.duration_minutes}min · {rs.reason}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Fuel stops */}
                {opt.fuel_stops?.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--orange)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.08em' }}>Fuel Stops</div>
                    {opt.fuel_stops.map((fs, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: 'rgba(255,107,53,.06)', border: '1px solid rgba(255,107,53,.15)', borderRadius: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: 14 }}>⛽</span>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 600 }}>{fs.station_name}</div>
                          <div style={{ fontSize: 10, color: 'var(--muted)' }}>{fs.location} · Mile {fs.miles_from_start}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {opt.optimization_notes && (
                  <div style={{ padding: '7px 9px', background: 'rgba(0,200,150,.06)', border: '1px solid rgba(0,200,150,.15)', borderRadius: 6, fontSize: 10, color: 'var(--muted)', lineHeight: 1.5 }}>
                    💡 {opt.optimization_notes}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {tab === 'knapsack' && (
          <>
            <div style={{ padding: '8px 10px', background: 'rgba(124,58,237,.08)', border: '1px solid rgba(124,58,237,.2)', borderRadius: 7, marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#a78bfa', marginBottom: 3 }}>♟ Dynamic Programming Knapsack</div>
              <div style={{ fontSize: 10, color: 'var(--muted)', lineHeight: 1.5 }}>Maximizes revenue by selecting the optimal combination of loads within truck weight capacity and driver HOS time constraints.</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginBottom: 8 }}>
              <div>
                <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '.05em' }}>Truck Capacity (lbs)</label>
                <input className="input" value={truckCap} onChange={e => setTruckCap(e.target.value)} placeholder="45000"/>
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '.05em' }}>Driver HOS (h)</label>
                <input className="input" value={driverHos} onChange={e => setDriverHos(e.target.value)} placeholder="11"/>
              </div>
            </div>

            {/* Load list */}
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>Available Loads</div>
            {loads.map((l, i) => (
              <div key={l.id} style={{ padding: '8px 10px', background: 'rgba(255,255,255,.03)', border: '1px solid var(--border)', borderRadius: 7, marginBottom: 5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700 }}>{l.id}</span>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--green)' }}>${l.revenue_usd.toLocaleString()}</span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>{l.pickup} → {l.delivery}</div>
                <div style={{ display: 'flex', gap: 10, marginTop: 3, fontSize: 10, color: 'var(--muted)' }}>
                  <span>⚖ {(l.weight_lbs / 1000).toFixed(0)}k lbs</span>
                  <span>📏 {l.distance_miles}mi</span>
                  <span>⏰ {l.deadline_hours}h deadline</span>
                </div>
              </div>
            ))}

            <button className="btn-primary" style={{ width: '100%', padding: 8, fontSize: 12, marginBottom: 10, background: 'var(--purple)' }} onClick={runKnapsack} disabled={kLoading}>
              {kLoading ? 'Optimizing…' : '♟ Run Knapsack Optimization'}
            </button>

            {knapsackResult?.optimization && (
              <div style={{ animation: 'slide-up .3s ease' }}>
                <div style={{ padding: '10px 12px', background: 'rgba(124,58,237,.1)', border: '1px solid rgba(124,58,237,.3)', borderRadius: 9, marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#a78bfa', marginBottom: 8 }}>✦ Optimal Load Selection</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
                    {[
                      { l: 'Max Revenue', v: `$${knapsackResult.optimization.total_revenue?.toLocaleString()}`, c: 'var(--green)' },
                      { l: 'Net Profit', v: `$${knapsackResult.optimization.profit_usd?.toFixed(0)}`, c: 'var(--green)' },
                      { l: 'Total Miles', v: `${knapsackResult.optimization.total_miles?.toLocaleString()}`, c: 'var(--muted)' },
                      { l: 'Utilization', v: `${knapsackResult.optimization.utilization_pct}%`, c: 'var(--orange)' },
                    ].map(c => (
                      <div key={c.l} style={{ background: 'rgba(255,255,255,.04)', borderRadius: 6, padding: '7px 9px' }}>
                        <div style={{ fontSize: 9, color: 'var(--muted)', marginBottom: 2 }}>{c.l}</div>
                        <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 700, color: c.c }}>{c.v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.08em' }}>Selected Loads</div>
                  {knapsackResult.optimization.selected_loads?.map((l: any) => (
                    <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 8px', background: 'rgba(0,200,150,.07)', border: '1px solid rgba(0,200,150,.15)', borderRadius: 5, marginBottom: 4 }}>
                      <div>
                        <span style={{ fontSize: 11, fontWeight: 700 }}>{l.id}</span>
                        <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 8 }}>{l.pickup?.split(',')[0]} → {l.delivery?.split(',')[0]}</span>
                      </div>
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--green)' }}>${l.revenue_usd?.toLocaleString()}</span>
                    </div>
                  ))}
                  <div style={{ marginTop: 8, fontSize: 10, color: 'var(--muted)', padding: '5px 8px', background: 'rgba(255,255,255,.04)', borderRadius: 5 }}>
                    Algorithm: {knapsackResult.algorithm}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
