import React from 'react';

export default function StatsCard({ label, value, icon: Icon, color, bg, trend }) {
  return (
    <div className="card">
      <div className="card-top-accent" style={{ background: color }} />
      <div className="stat-header">
        <div className="stat-label">{label}</div>
        <div className="stat-icon" style={{ backgroundColor: bg, color: color }}>
          <Icon size={22} />
        </div>
      </div>
      <div className="stat-value">{value}</div>
      {trend && (
        <div style={{ fontSize: '0.78rem', color: '#059669', fontWeight: '700', marginTop: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          ↑ {trend}
        </div>
      )}
    </div>
  );
}
