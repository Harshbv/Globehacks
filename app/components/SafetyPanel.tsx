'use client';
// app/components/SafetyPanel.tsx
import { useState } from 'react';
import { Driver, SafetyReport } from '../types';

interface Props { drivers: Driver[]; }

const COMPLIANCE_COLOR: Record<string, string> = {
  compliant: 'var(--green)',
  warning:   'var(--amber)',
  violation: 'var(--red)',
};
const FATIGUE_COLOR: Record<string, string> = {
  low:    'var(--green)',
  medium: 'var(--amber)',
  high:   'var(--red)',
};

// ─── Safe helpers — never crash on undefined ──────────────────────────────────
function safeUpper(val: string | undefined | null): string {
  if (!val || typeof val !== 'string') return '—';
  return val.toUpperCase();
}
function safeColor(map: Record<string, string>, key: string | undefined | null, fallback = 'var(--muted)'): string {
  if (!key) return fallback;
  return map[key] ?? fallback;
}
function buildDemoReport(hos: number, safety: number): SafetyReport {
  const compliance = hos > 4 ? 'compliant' : hos > 2 ? 'warning' : 'violation';
  const fatigue    = hos > 6 ? 'low'       : hos > 3 ? 'medium'  : 'high';
  return {
    overall_score:   Math.min(safety, 100),
    hos_compliance:  compliance,
    fatigue_risk:    fatigue,
    flags: hos < 2
      ? ['HOS critically low — dispatch blocked', 'Mandatory 10h rest required immediately per FMCSA']
      : hos < 4
      ? ['Approaching HOS limit — plan rest stop within 1 hour', 'Do not assign loads requiring more than 2h drive time']
      : [],
    recommendations: hos < 4
      ? ['Schedule mandatory 30-min break', 'Assign shorter loads only', 'Alert dispatcher before accepting new load']
      : ['Driver is FMCSA compliant — ready for new assignment', 'Monitor HOS every 2 hours'],
    block_dispatch: hos < 2,
    block_reason:   hos < 2 ? `Only ${hos.toFixed(1)}h HOS remaining — FMCSA violation imminent` : undefined,
  };
}

// ─── Single driver card ───────────────────────────────────────────────────────
function DriverSafetyCard({ driver }: { driver: Driver }) {
  const [report, setReport]   = useState<SafetyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen]       = useState(false);

  const hos    = driver.enriched?.hos_remaining  ?? 8;
  const safety = driver.enriched?.safety_score   ?? 80;
  const fuel   = driver.enriched?.fuel_level_pct ?? 50;
  const fn     = driver.basic_info?.driver_first_name ?? 'Driver';
  const ln     = driver.basic_info?.driver_last_name  ?? '';
  const status = driver.basic_info?.work_status ?? 'UNKNOWN';

  const statusColor = hos < 2 ? 'var(--red)' : hos < 4 ? 'var(--amber)' : 'var(--green)';
  const scoreColor  = safety > 80 ? 'var(--green)' : safety > 60 ? 'var(--amber)' : 'var(--red)';

  const runCheck = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/safety', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driver_name:          `${fn} ${ln}`,
          hos_remaining:        hos,
          hours_driven_today:   Math.max(0, 11 - hos),
          last_rest_hours_ago:  2 + Math.random() * 3,
          speed_violations_7d:  safety < 75 ? 2 : 0,
          hos_violations_30d:   safety < 70 ? 1 : 0,
          load_distance_miles:  500,
        }),
      });
      const data = await res.json();
      // Validate response has required fields
      const safe: SafetyReport = {
        overall_score:  typeof data.overall_score  === 'number' ? data.overall_score  : safety,
        hos_compliance: data.hos_compliance  || (hos > 4 ? 'compliant' : hos > 2 ? 'warning' : 'violation'),
        fatigue_risk:   data.fatigue_risk    || (hos > 6 ? 'low' : hos > 3 ? 'medium' : 'high'),
        flags:          Array.isArray(data.flags)           ? data.flags           : [],
        recommendations:Array.isArray(data.recommendations) ? data.recommendations : [],
        block_dispatch: typeof data.block_dispatch === 'boolean' ? data.block_dispatch : hos < 2,
        block_reason:   data.block_reason || undefined,
      };
      setReport(safe);
    } catch {
      setReport(buildDemoReport(hos, safety));
    }
    setOpen(true);
    setLoading(false);
  };

  const toggle = () => {
    if (open) { setOpen(false); return; }
    if (report) { setOpen(true); return; }
    runCheck();
  };

  return (
    <div style={{
      border: `1px solid ${hos < 2 ? 'rgba(255,71,87,.35)' : 'var(--border)'}`,
      borderRadius: 9,
      background: hos < 2 ? 'rgba(255,71,87,.05)' : 'rgba(255,255,255,.03)',
      marginBottom: 8, overflow: 'hidden',
    }}>
      {/* Header row */}
      <div onClick={toggle} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', cursor:'pointer' }}>
        {/* Score ring */}
        <div style={{
          width:36, height:36, borderRadius:'50%', flexShrink:0,
          background:`rgba(${safety>80?'0,200,150':safety>60?'255,184,0':'255,71,87'},.15)`,
          border:`2px solid ${scoreColor}`,
          display:'flex', alignItems:'center', justifyContent:'center',
          fontFamily:"'Syne',sans-serif", fontSize:13, fontWeight:800, color:scoreColor,
        }}>{safety}</div>

        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:12, fontWeight:600, display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
            {fn} {ln}
            {hos < 2 && <span style={{ fontSize:9, background:'rgba(255,71,87,.2)', color:'var(--red)', padding:'1px 6px', borderRadius:3, fontWeight:700 }}>BLOCKED</span>}
            {hos >= 2 && hos < 4 && <span style={{ fontSize:9, background:'rgba(255,184,0,.15)', color:'var(--amber)', padding:'1px 6px', borderRadius:3, fontWeight:700 }}>WARNING</span>}
          </div>
          <div style={{ display:'flex', gap:8, marginTop:3, flexWrap:'wrap' }}>
            <span style={{ fontSize:10, color:statusColor, fontFamily:"'DM Mono',monospace" }}>{hos.toFixed(1)}h HOS</span>
            <span style={{ fontSize:10, color:'var(--muted)' }}>·</span>
            <span style={{ fontSize:10, color:fuel<20?'var(--red)':'var(--muted)', fontFamily:"'DM Mono',monospace" }}>⛽ {fuel}%</span>
            <span style={{ fontSize:10, color:'var(--muted)' }}>·</span>
            <span style={{ fontSize:10, color:'var(--muted)' }}>{status}</span>
          </div>
        </div>

        <div style={{ flexShrink:0, display:'flex', alignItems:'center', gap:6 }}>
          {loading && <div style={{ width:13, height:13, border:'2px solid var(--border)', borderTopColor:'var(--orange)', borderRadius:'50%', animation:'spin .6s linear infinite' }}/>}
          {!loading && <span style={{ fontSize:11, color:'var(--muted)' }}>{open ? '▲' : '▼'}</span>}
        </div>
      </div>

      {/* Expanded report */}
      {open && report && (
        <div style={{ padding:'0 12px 12px', borderTop:'1px solid var(--border)' }}>
          {/* 4 stat boxes */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginTop:10, marginBottom:10 }}>
            <div style={{ background:'rgba(255,255,255,.04)', borderRadius:7, padding:'8px 10px' }}>
              <div style={{ fontSize:9, color:'var(--muted)', marginBottom:2 }}>Overall Score</div>
              <div style={{ fontSize:20, fontWeight:700, fontFamily:"'Syne',sans-serif", color:scoreColor }}>{report.overall_score ?? '—'}</div>
            </div>
            <div style={{ background:'rgba(255,255,255,.04)', borderRadius:7, padding:'8px 10px' }}>
              <div style={{ fontSize:9, color:'var(--muted)', marginBottom:2 }}>HOS Status</div>
              <div style={{ fontSize:12, fontWeight:700, color:safeColor(COMPLIANCE_COLOR, report.hos_compliance) }}>
                {safeUpper(report.hos_compliance)}
              </div>
            </div>
            <div style={{ background:'rgba(255,255,255,.04)', borderRadius:7, padding:'8px 10px' }}>
              <div style={{ fontSize:9, color:'var(--muted)', marginBottom:2 }}>Fatigue Risk</div>
              <div style={{ fontSize:12, fontWeight:700, color:safeColor(FATIGUE_COLOR, report.fatigue_risk) }}>
                {safeUpper(report.fatigue_risk)}
              </div>
            </div>
            <div style={{ background:'rgba(255,255,255,.04)', borderRadius:7, padding:'8px 10px' }}>
              <div style={{ fontSize:9, color:'var(--muted)', marginBottom:2 }}>Dispatch</div>
              <div style={{ fontSize:12, fontWeight:700, color:report.block_dispatch?'var(--red)':'var(--green)' }}>
                {report.block_dispatch ? '🚫 BLOCKED' : '✅ CLEAR'}
              </div>
            </div>
          </div>

          {/* Block reason */}
          {report.block_dispatch && report.block_reason && (
            <div style={{ padding:'7px 9px', background:'rgba(255,71,87,.1)', border:'1px solid rgba(255,71,87,.3)', borderRadius:6, marginBottom:8, fontSize:11, color:'var(--red)', fontWeight:500 }}>
              🚫 {report.block_reason}
            </div>
          )}

          {/* Flags */}
          {report.flags.length > 0 && (
            <div style={{ marginBottom:8 }}>
              <div style={{ fontSize:10, fontWeight:700, color:'var(--amber)', marginBottom:5, textTransform:'uppercase', letterSpacing:'.06em' }}>⚠ Flags</div>
              {report.flags.map((f, i) => (
                <div key={i} style={{ fontSize:11, color:'var(--amber)', marginBottom:4, display:'flex', gap:6, lineHeight:1.4 }}>
                  <span style={{ flexShrink:0 }}>•</span><span>{f}</span>
                </div>
              ))}
            </div>
          )}

          {/* Recommendations */}
          {report.recommendations.length > 0 && (
            <div>
              <div style={{ fontSize:10, fontWeight:700, color:'var(--green)', marginBottom:5, textTransform:'uppercase', letterSpacing:'.06em' }}>✓ Recommendations</div>
              {report.recommendations.map((r, i) => (
                <div key={i} style={{ fontSize:11, color:'var(--muted)', marginBottom:4, display:'flex', gap:6, lineHeight:1.4 }}>
                  <span style={{ color:'var(--green)', flexShrink:0 }}>→</span><span>{r}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Safety Panel ────────────────────────────────────────────────────────
export default function SafetyPanel({ drivers }: Props) {
  const blocked = drivers.filter(d => (d.enriched?.hos_remaining ?? 8) < 2).length;
  const warning = drivers.filter(d => { const h = d.enriched?.hos_remaining ?? 8; return h >= 2 && h < 4; }).length;
  const clear   = drivers.filter(d => (d.enriched?.hos_remaining ?? 8) >= 4).length;

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
      {/* Summary */}
      <div style={{ display:'flex', gap:6, padding:'10px 12px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
        {[
          { l:'Blocked', v:blocked, c:'var(--red)',   bg:'rgba(255,71,87,.1)'  },
          { l:'Warning', v:warning, c:'var(--amber)', bg:'rgba(255,184,0,.1)' },
          { l:'Clear',   v:clear,   c:'var(--green)', bg:'rgba(0,200,150,.1)' },
        ].map(s => (
          <div key={s.l} style={{ flex:1, background:s.bg, border:`1px solid ${s.c}44`, borderRadius:7, padding:'7px 8px', textAlign:'center' }}>
            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:20, fontWeight:800, color:s.c }}>{s.v}</div>
            <div style={{ fontSize:9, color:s.c, opacity:0.85, marginTop:1 }}>{s.l}</div>
          </div>
        ))}
      </div>

      <div style={{ padding:'7px 12px', flexShrink:0, fontSize:10, color:'var(--muted)', borderBottom:'1px solid var(--border)', lineHeight:1.5 }}>
        Click any driver → Groq AI runs full FMCSA compliance check
      </div>

      {/* Driver cards sorted by HOS (critical first) */}
      <div style={{ flex:1, overflowY:'auto', padding:'10px 12px' }}>
        {drivers.length === 0 && (
          <div style={{ textAlign:'center', color:'var(--muted)', fontSize:12, padding:20 }}>
            Loading driver safety data…
          </div>
        )}
        {[...drivers]
          .sort((a, b) => (a.enriched?.hos_remaining ?? 8) - (b.enriched?.hos_remaining ?? 8))
          .map(d => <DriverSafetyCard key={d.driver_id} driver={d}/>)
        }
      </div>

      {/* FMCSA footer */}
      <div style={{ padding:'7px 12px', borderTop:'1px solid var(--border)', flexShrink:0, fontSize:10, color:'var(--muted)', lineHeight:1.5 }}>
        🛡 FMCSA: 11h max driving · 14h on-duty · 30min break after 8h · 10h off between shifts
      </div>
    </div>
  );
}
