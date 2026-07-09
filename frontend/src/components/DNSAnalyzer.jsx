import React, { useState } from 'react';
import { Globe, CheckCircle2, AlertTriangle, XCircle, Copy, Check, Shield, Mail, Server, Info } from 'lucide-react';

export default function DNSAnalyzer({ dnsData, vpsIP }) {
  const [copiedIndex, setCopiedIndex] = useState(null);

  if (!dnsData) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
        <Globe size={40} color="#94a3b8" style={{ marginBottom: '0.75rem' }} />
        <p style={{ color: 'var(--text-muted, #94a3b8)', fontWeight: '600' }}>No hay datos DNS disponibles</p>
      </div>
    );
  }

  const { domain, records = {}, spf, dkim, dmarc, instructions = [], overallStatus } = dnsData;

  const handleCopy = async (text, idx) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(idx);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.error('Error al copiar:', err);
    }
  };

  const getOverallBadge = () => {
    switch (overallStatus) {
      case 'CORRECT':
        return { label: 'Configuración Correcta', bg: '#dcfce7', color: '#15803d', icon: CheckCircle2 };
      case 'PARTIAL':
        return { label: 'Configuración Parcial', bg: '#fef3c7', color: '#b45309', icon: AlertTriangle };
      default:
        return { label: 'Configuración Incorrecta', bg: '#fee2e2', color: '#dc2626', icon: XCircle };
    }
  };

  const getRecordStatusIcon = (status) => {
    const s = String(status).toLowerCase();
    switch (s) {
      case 'correct':
      case 'success':
        return <CheckCircle2 size={16} color="#16a34a" />;
      case 'warning':
      case 'partial':
        return <AlertTriangle size={16} color="#f59e0b" />;
      default:
        return <XCircle size={16} color="#dc2626" />;
    }
  };

  const getTypeBadgeColor = (type) => {
    const colors = {
      A: { bg: '#dbeafe', color: '#1e40af' },
      AAAA: { bg: '#e0e7ff', color: '#3730a3' },
      MX: { bg: '#fce7f3', color: '#be185d' },
      TXT: { bg: '#fef3c7', color: '#b45309' },
      NS: { bg: '#d1fae5', color: '#047857' },
      CNAME: { bg: '#f3e8ff', color: '#7c3aed' },
    };
    return colors[type] || { bg: '#f1f5f9', color: '#475569' };
  };

  const badge = getOverallBadge();
  const BadgeIcon = badge.icon;

  const allRecords = [];
  const recordTypes = ['A', 'AAAA', 'MX', 'TXT', 'NS', 'CNAME'];
  recordTypes.forEach(type => {
    if (records[type] && Array.isArray(records[type])) {
      records[type].forEach(rec => allRecords.push({ ...rec, type }));
    }
  });

  const authChecks = [
    { key: 'spf', label: 'SPF', icon: Shield, data: spf },
    { key: 'dkim', label: 'DKIM', icon: Mail, data: dkim },
    { key: 'dmarc', label: 'DMARC', icon: Server, data: dmarc },
  ];

  return (
    <div className="card" style={{ padding: '1.75rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
            <Globe size={22} color="#284999" />
            <h3 style={{
              fontFamily: "'Outfit', sans-serif", fontWeight: '800',
              fontSize: '1.3rem', color: 'var(--text-main, #0f172a)', margin: 0,
            }}>
              {domain}
            </h3>
          </div>
          {vpsIP && (
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted, #94a3b8)', fontWeight: '600' }}>
              IP del Servidor VPS: <strong style={{ color: '#284999' }}>{vpsIP}</strong>
            </span>
          )}
        </div>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
          fontSize: '0.8rem', fontWeight: '800', padding: '0.4rem 0.85rem',
          borderRadius: '9999px', backgroundColor: badge.bg, color: badge.color,
        }}>
          <BadgeIcon size={14} />
          {badge.label}
        </span>
      </div>

      {/* DNS Records Table */}
      {allRecords.length > 0 && (
        <div style={{ marginBottom: '1.75rem' }}>
          <h4 style={{
            fontFamily: "'Outfit', sans-serif", fontWeight: '800',
            fontSize: '1rem', color: 'var(--text-main, #0f172a)', marginBottom: '0.85rem',
          }}>
            Registros DNS
          </h4>
          <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-md, 12px)', border: '1px solid #e2e8f0' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#284999' }}>
                  <th style={thStyle}>Tipo</th>
                  <th style={thStyle}>Valor Actual</th>
                  <th style={thStyle}>Valor Esperado</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {allRecords.map((rec, i) => {
                  const typeColor = getTypeBadgeColor(rec.type);
                  return (
                    <tr key={i} style={{
                      borderBottom: '1px solid #f1f5f9',
                      backgroundColor: i % 2 === 0 ? '#ffffff' : '#f8fafc',
                    }}>
                      <td style={tdStyle}>
                        <span style={{
                          fontSize: '0.72rem', fontWeight: '800', padding: '0.2rem 0.55rem',
                          borderRadius: '9999px', backgroundColor: typeColor.bg, color: typeColor.color,
                          fontFamily: "'JetBrains Mono', monospace",
                        }}>
                          {rec.type}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontSize: '0.78rem', maxWidth: '260px', wordBreak: 'break-all' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span>{rec.current || '—'}</span>
                          {rec.current && (
                            <button
                              onClick={() => handleCopy(rec.current, `cur-${i}`)}
                              style={copyBtnStyle}
                              title="Copiar valor"
                            >
                              {copiedIndex === `cur-${i}` ? <Check size={12} color="#16a34a" /> : <Copy size={12} color="#94a3b8" />}
                            </button>
                          )}
                        </div>
                      </td>
                      <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontSize: '0.78rem', maxWidth: '260px', wordBreak: 'break-all' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span>{rec.expected || '—'}</span>
                          {rec.expected && (
                            <button
                              onClick={() => handleCopy(rec.expected, `exp-${i}`)}
                              style={copyBtnStyle}
                              title="Copiar valor"
                            >
                              {copiedIndex === `exp-${i}` ? <Check size={12} color="#16a34a" /> : <Copy size={12} color="#94a3b8" />}
                            </button>
                          )}
                        </div>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        {getRecordStatusIcon(rec.status)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SPF / DKIM / DMARC Section */}
      <div style={{ marginBottom: '1.75rem' }}>
        <h4 style={{
          fontFamily: "'Outfit', sans-serif", fontWeight: '800',
          fontSize: '1rem', color: 'var(--text-main, #0f172a)', marginBottom: '0.85rem',
        }}>
          Autenticación de Correo
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
          {authChecks.map(({ key, label, icon: Icon, data }) => {
            const found = data && data.found;
            return (
              <div key={key} style={{
                padding: '1rem', borderRadius: 'var(--radius-md, 12px)',
                backgroundColor: found ? '#f0fdf4' : '#fef2f2',
                border: `1.5px solid ${found ? '#86efac' : '#fca5a5'}`,
                textAlign: 'center',
              }}>
                <Icon size={22} color={found ? '#16a34a' : '#dc2626'} style={{ marginBottom: '0.4rem' }} />
                <div style={{ fontWeight: '800', fontSize: '0.95rem', color: found ? '#15803d' : '#dc2626', marginBottom: '0.2rem' }}>
                  {label}
                </div>
                <span style={{
                  fontSize: '0.75rem', fontWeight: '700',
                  color: found ? '#16a34a' : '#dc2626',
                }}>
                  {found ? 'Configurado' : 'No encontrado'}
                </span>
                {data && data.value && (
                  <div style={{
                    marginTop: '0.5rem', fontSize: '0.7rem', fontFamily: "'JetBrains Mono', monospace",
                    color: 'var(--text-sub, #475569)', wordBreak: 'break-all',
                    backgroundColor: 'rgba(255,255,255,0.7)', padding: '0.4rem', borderRadius: '6px',
                  }}>
                    {data.value.length > 80 ? data.value.substring(0, 80) + '...' : data.value}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Instructions */}
      {instructions.length > 0 && (
        <div>
          <h4 style={{
            fontFamily: "'Outfit', sans-serif", fontWeight: '800',
            fontSize: '1rem', color: 'var(--text-main, #0f172a)', marginBottom: '0.85rem',
            display: 'flex', alignItems: 'center', gap: '0.5rem',
          }}>
            <Info size={18} color="#284999" />
            Instrucciones de Configuración
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {instructions.map((instr, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                padding: '0.85rem 1rem', borderRadius: 'var(--radius-sm, 8px)',
                backgroundColor: '#f8fafc', border: '1px solid #e2e8f0',
              }}>
                <span style={{
                  width: '24px', height: '24px', borderRadius: '50%',
                  backgroundColor: '#284999', color: '#ffffff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.72rem', fontWeight: '800', flexShrink: 0,
                }}>
                  {i + 1}
                </span>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-main, #0f172a)', fontWeight: '600', lineHeight: '1.5' }}>
                    {instr.description || instr.text || String(instr)}
                  </p>
                  {(instr.expectedValue || instr.value) && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem',
                    }}>
                      <code style={{
                        fontSize: '0.78rem', fontFamily: "'JetBrains Mono', monospace",
                        backgroundColor: '#eef2ff', padding: '0.35rem 0.65rem',
                        borderRadius: '6px', color: '#284999', flex: 1,
                        wordBreak: 'break-all',
                      }}>
                        {instr.expectedValue || instr.value}
                      </code>
                      <button
                        onClick={() => handleCopy(instr.expectedValue || instr.value, `instr-${i}`)}
                        style={{
                          ...copyBtnStyle,
                          padding: '0.35rem 0.65rem', borderRadius: '9999px',
                          backgroundColor: copiedIndex === `instr-${i}` ? '#dcfce7' : '#f1f5f9',
                          border: `1px solid ${copiedIndex === `instr-${i}` ? '#86efac' : '#e2e8f0'}`,
                        }}
                        title="Copiar al portapapeles"
                      >
                        {copiedIndex === `instr-${i}` ? <Check size={13} color="#16a34a" /> : <Copy size={13} color="#64748b" />}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const thStyle = {
  padding: '0.75rem 1rem', textAlign: 'left',
  fontWeight: '700', fontSize: '0.78rem',
  color: '#ffffff', textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const tdStyle = {
  padding: '0.7rem 1rem', color: 'var(--text-main, #0f172a)',
  fontWeight: '600',
};

const copyBtnStyle = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: '26px', height: '26px', borderRadius: '6px',
  border: '1px solid #e2e8f0', backgroundColor: '#f8fafc',
  cursor: 'pointer', transition: 'all 0.15s ease', flexShrink: 0,
  padding: 0,
};
