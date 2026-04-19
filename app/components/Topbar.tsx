'use client';
// app/components/Topbar.tsx
import { useState, useEffect } from 'react';

interface TopbarProps {
  dataSource: 'navpro_api' | 'demo';
  driverCount: number;
  alertCount: number;
}

export default function Topbar({ dataSource, driverCount, alertCount }: TopbarProps) {
  const [time, setTime] = useState('');
  const [activeTab, setActiveTab] = useState('Fleet Map');

  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString('en-US', { hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const tabs = ['Fleet Map', 'Analytics', 'Loads', 'Reports'];

  return (
    <header style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 18px', height: '50px',
      background: 'var(--navy2)', borderBottom: '1px solid var(--border)',
      flexShrink: 0, zIndex: 200,
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 18,
          letterSpacing: '-0.5px', display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <div style={{
            width: 9, height: 9, borderRadius: '50%', background: 'var(--orange)',
            animation: 'pulse-dot 2s ease-in-out infinite',
          }}/>
          DispatchIQ
        </div>
        <div style={{
          fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
          background: dataSource === 'navpro_api' ? 'rgba(0,200,150,.12)' : 'rgba(255,184,0,.12)',
          color: dataSource === 'navpro_api' ? 'var(--green)' : 'var(--amber)',
          border: `1px solid ${dataSource === 'navpro_api' ? 'rgba(0,200,150,.25)' : 'rgba(255,184,0,.25)'}`,
          fontFamily: "'DM Mono', monospace",
        }}>
          {dataSource === 'navpro_api' ? '● NavPro Live' : '● Demo Mode'}
        </div>
      </div>

      {/* Tabs */}
      <nav style={{ display: 'flex', gap: 4 }}>
        {tabs.map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            style={{
              padding: '5px 13px', borderRadius: 6, fontSize: 12, fontWeight: 500,
              cursor: 'pointer', transition: 'all .15s', fontFamily: 'inherit',
              background: activeTab === t ? 'rgba(255,255,255,.07)' : 'transparent',
              color: activeTab === t ? '#fff' : 'var(--muted)',
              border: `1px solid ${activeTab === t ? 'var(--border)' : 'transparent'}`,
            }}
          >{t}</button>
        ))}
      </nav>

      {/* Right */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Live pill */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5,
          fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--green)',
          background: 'rgba(0,200,150,.1)', border: '1px solid rgba(0,200,150,.2)',
          padding: '3px 10px', borderRadius: 20,
        }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', animation: 'blink 1.2s infinite' }}/>
          LIVE
        </div>

        {/* Alert bell */}
        <div style={{ position: 'relative', cursor: 'pointer' }}>
          <span style={{ fontSize: 16 }}>🔔</span>
          {alertCount > 0 && (
            <div style={{
              position: 'absolute', top: -4, right: -4,
              width: 16, height: 16, borderRadius: '50%',
              background: 'var(--red)', fontSize: 9, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{alertCount}</div>
          )}
        </div>

        {/* Clock */}
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--muted)' }}>{time}</span>

        {/* Avatar */}
        <div style={{
          width: 30, height: 30, borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--orange), var(--blue))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700, cursor: 'pointer',
        }}>M</div>
      </div>
    </header>
  );
}
