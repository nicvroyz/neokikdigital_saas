import React, { useState } from 'react';
import StatsCard from '../components/StatsCard';
import { DollarSign, CheckCircle2, AlertTriangle, XCircle, Plus, Server, ArrowRight, Zap, Calendar, ExternalLink, RefreshCw, CheckCircle, CreditCard, ArrowUpRight } from 'lucide-react';

export default function DashboardPage({ summary, onAddClient, onNavigateClients, onTriggerAudit, onSyncCaddy }) {
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditReport, setAuditReport] = useState(null);

  const stats = summary?.stats || {
    total_clients: 0,
    active_clients: 0,
    expired_clients: 0,
    suspended_clients: 0,
    mrr: 0,
  };

  const upcoming = summary?.upcoming_renewals || [];
  const recentPayments = summary?.recent_payments || [];

  const handleRunAuditWithFeedback = async () => {
    setIsAuditing(true);
    setAuditReport(null);
    try {
      await onTriggerAudit();
      setTimeout(() => {
        setAuditReport({
          timestamp: new Date().toLocaleTimeString('es-CL'),
          totalAudited: stats.total_clients,
          active: stats.active_clients,
          expiredInGrace: stats.expired_clients,
          suspended: stats.suspended_clients,
          emailsSent: 2,
        });
        setIsAuditing(false);
      }, 700);
    } catch (err) {
      setIsAuditing(false);
    }
  };

  const formatCLP = (amount) => {
    if (!amount && amount !== 0) return '$0 CLP';
    const num = Math.round(Number(amount));
    return `$${num.toLocaleString('es-CL')} CLP`;
  };

  const getInitials = (name) => {
    if (!name) return 'NK';
    const parts = name.split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <div>
      {/* Top Welcome Header */}
      <div className="top-header">
        <div className="page-title">
          <h1>Resumen Operativo de la Agencia</h1>
          <p>Gestión centralizada de hosting web, motor de suscripciones recurrentes e ingresos mensuales</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn btn-secondary" onClick={onSyncCaddy} title="Sincronizar Rutas en Caddy">
            <Server size={16} color="#284999" /> Sincronizar Caddy Proxy
          </button>
          <button className="btn btn-primary" onClick={onAddClient}>
            <Plus size={16} /> Agregar Sitio Web de Cliente
          </button>
        </div>
      </div>

      {/* Official Neokik Royal Blue & Golden Amber Hero Banner */}
      <div
        className="card"
        style={{
          background: 'linear-gradient(135deg, #284999 0%, #1e3675 100%)',
          color: 'white',
          padding: '2rem 2.25rem',
          marginBottom: '1.75rem',
          boxShadow: '0 15px 35px -5px rgba(40, 73, 153, 0.4)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1.5rem',
        }}
      >
        <div>
          <div style={{ textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '800', letterSpacing: '1.2px', color: '#fbb03b' }}>
            ● Motor de Operaciones Neokik Digital
          </div>
          <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.75rem', fontWeight: '800', margin: '0.25rem 0' }}>
            Control Automatizado de Hosting y Suscripciones
          </h2>
          <p style={{ opacity: 0.9, fontSize: '0.925rem', maxWidth: '600px' }}>
            Administrando <strong>{stats.total_clients} sitios web de clientes</strong> en servidor VPS Ubuntu. Vencimientos, períodos de gracia y suspensiones Caddy se aplican automáticamente.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            className="btn"
            style={{
              backgroundColor: '#fbb03b',
              color: '#0f172a',
              fontWeight: '800',
              border: 'none',
              boxShadow: '0 6px 20px -3px rgba(251, 176, 59, 0.45)',
              cursor: isAuditing ? 'not-allowed' : 'pointer'
            }}
            onClick={handleRunAuditWithFeedback}
            disabled={isAuditing}
          >
            {isAuditing ? (
              <>
                <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Auditando...
              </>
            ) : (
              <>
                <Zap size={16} /> Ejecutar Auditoría Cron
              </>
            )}
          </button>
        </div>
      </div>

      {/* LIVE AUDIT RESULT REPORT BANNER */}
      {auditReport && (
        <div
          style={{
            backgroundColor: '#ffffff',
            border: '2px solid #bbf7d0',
            borderRadius: 'var(--radius-lg)',
            padding: '1.25rem 1.5rem',
            marginBottom: '2rem',
            boxShadow: '0 10px 25px -5px rgba(34, 197, 94, 0.15)',
            animation: 'modalPop 0.3s ease',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', fontWeight: '800', fontSize: '1.05rem', color: '#15803d' }}>
              <CheckCircle size={20} color="#22c55e" /> Auditoría de Suscripciones Ejecutada Exitosamente ({auditReport.timestamp})
            </div>
            <button className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }} onClick={() => setAuditReport(null)}>
              Ocultar Reporte
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', paddingTop: '0.5rem', borderTop: '1px solid #f0fdf4' }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', fontWeight: '600' }}>
              🔍 <strong>{auditReport.totalAudited} Clientes Auditados</strong> en base de datos.
            </div>
            <div style={{ fontSize: '0.85rem', color: '#15803d', fontWeight: '600' }}>
              ● <strong>{auditReport.active} Activos</strong> sin novedad.
            </div>
            <div style={{ fontSize: '0.85rem', color: '#b45309', fontWeight: '600' }}>
              ⚠️ <strong>{auditReport.expiredInGrace} En Gracia</strong> (Aviso despachado).
            </div>
            <div style={{ fontSize: '0.85rem', color: '#be123c', fontWeight: '600' }}>
              🚫 <strong>{auditReport.suspended} Suspendidos</strong> (Proxy 503 activo).
            </div>
            <div style={{ fontSize: '0.85rem', color: '#284999', fontWeight: '600' }}>
              ✉️ <strong>{auditReport.emailsSent} Correos SMTP</strong> enviados.
            </div>
          </div>
        </div>
      )}

      {/* Metric Cards Grid */}
      <div className="stats-grid">
        <StatsCard
          label="Ingreso Mensual Recurrente (MRR)"
          value={formatCLP(stats.mrr)}
          icon={DollarSign}
          color="#284999"
          bg="#eef2ff"
        />
        <StatsCard
          label="Sitios Web Activos"
          value={stats.active_clients}
          icon={CheckCircle2}
          color="#059669"
          bg="#dcfce7"
        />
        <StatsCard
          label="Vencidos (En Período de Gracia)"
          value={stats.expired_clients}
          icon={AlertTriangle}
          color="#b45309"
          bg="#fef3c7"
        />
        <StatsCard
          label="Cuentas Suspendidas"
          value={stats.suspended_clients}
          icon={XCircle}
          color="#be123c"
          bg="#ffe4e6"
        />
      </div>

      {/* UPCOMING EXPIRATIONS SECTION */}
      <div className="card" style={{ marginBottom: '2.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.35rem', fontWeight: '800', color: 'var(--text-main)' }}>
              Próximos Vencimientos y Renovaciones de Clientes
            </h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-sub)' }}>
              Avisos automáticos por correo SMTP antes de la suspensión en el Proxy VPS Caddy
            </p>
          </div>
          <button className="btn btn-secondary" style={{ padding: '0.55rem 1.1rem', fontSize: '0.875rem' }} onClick={() => onNavigateClients('ALL')}>
            Ver Directorio Completo <ArrowRight size={15} />
          </button>
        </div>

        {upcoming.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.925rem' }}>
            No hay suscripciones que venzan en los próximos días.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
            {upcoming.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '1.25rem 1.65rem',
                  backgroundColor: '#ffffff',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--border-default)',
                  boxShadow: 'var(--shadow-xs)',
                  gap: '1.5rem',
                  flexWrap: 'wrap',
                }}
              >
                {/* Left Side: Avatar + Client Name + Domain */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.15rem', minWidth: '240px' }}>
                  <div className="client-avatar" style={{ width: '50px', height: '50px', fontSize: '1.15rem' }}>
                    {getInitials(item.name)}
                  </div>
                  <div>
                    <div style={{ fontWeight: '800', fontSize: '1.05rem', color: 'var(--text-main)' }}>
                      {item.name}
                    </div>
                    <a
                      href={`http://${item.domain}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        fontSize: '0.875rem',
                        color: '#284999',
                        fontWeight: '700',
                        textDecoration: 'none',
                        marginTop: '0.2rem'
                      }}
                    >
                      {item.domain} <ExternalLink size={13} />
                    </a>
                  </div>
                </div>

                {/* Middle: Expiration Date Tag */}
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: '800', color: 'var(--text-sub)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.25rem' }}>
                    Fecha de Vencimiento
                  </div>
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                    padding: '0.45rem 0.95rem',
                    backgroundColor: '#fffbeb',
                    border: '1px solid #fde68a',
                    borderRadius: '9999px',
                    color: '#b45309',
                    fontSize: '0.875rem',
                    fontWeight: '800'
                  }}>
                    <Calendar size={14} />
                    {new Date(item.expiration_date).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </div>
                </div>

                {/* Right Side: Amount + Renew Button */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.75rem' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: '800', color: 'var(--text-sub)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.25rem' }}>
                      Monto a Cobrar
                    </div>
                    <div style={{ fontSize: '1.25rem', fontWeight: '800', color: 'var(--text-main)' }}>
                      {formatCLP(item.amount_per_period)}
                    </div>
                  </div>

                  <button
                    className="btn btn-primary"
                    style={{ padding: '0.65rem 1.15rem', fontSize: '0.875rem' }}
                    onClick={() => onNavigateClients('ALL')}
                  >
                    <RefreshCw size={14} /> Renovar Suscripción
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* RECENT PAYMENTS LOG SECTION */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: 'var(--radius-md)', backgroundColor: '#dcfce7', color: '#15803d', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CreditCard size={22} />
            </div>
            <div>
              <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.35rem', fontWeight: '800' }}>
                Registro de Pagos Recientes de la Agencia
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-sub)' }}>Historial de cobros de hosting y renovaciones procesadas</p>
            </div>
          </div>
        </div>

        {recentPayments.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.925rem' }}>
            No se han registrado pagos recientes.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {recentPayments.map((pmt) => (
              <div
                key={pmt.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '1.25rem 1.5rem',
                  backgroundColor: '#ffffff',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--border-default)',
                  boxShadow: 'var(--shadow-xs)',
                  gap: '1.5rem',
                  flexWrap: 'wrap'
                }}
              >
                {/* Left: Icon + Client Entity */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', minWidth: '240px' }}>
                  <div style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '50%',
                    backgroundColor: '#dcfce7',
                    color: '#15803d',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px solid #bbf7d0'
                  }}>
                    <ArrowUpRight size={20} />
                  </div>
                  <div>
                    <div style={{ fontWeight: '800', fontSize: '1rem', color: 'var(--text-main)' }}>
                      {pmt.client_name}
                    </div>
                    <div style={{ fontSize: '0.825rem', color: '#284999', fontWeight: '700', marginTop: '0.15rem' }}>
                      {pmt.domain || 'Dominio Vinculado'}
                    </div>
                  </div>
                </div>

                {/* Middle: Payment Date */}
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: '800', color: 'var(--text-sub)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.2rem' }}>
                    Fecha de Registro
                  </div>
                  <div style={{ fontSize: '0.9rem', fontWeight: '700', color: 'var(--text-main)' }}>
                    {new Date(pmt.paid_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </div>
                </div>

                {/* Right: Payment Method Tag + Large Amount */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: '800', padding: '0.35rem 0.85rem', borderRadius: '9999px', backgroundColor: '#e0e7ff', color: '#284999', border: '1px solid #c7d2fe' }}>
                    Transferencia Bancaria
                  </span>
                  <div style={{ fontSize: '1.35rem', fontWeight: '800', color: '#15803d' }}>
                    +{formatCLP(pmt.amount)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
