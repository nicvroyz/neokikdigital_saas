import React from 'react';
import { ExternalLink, RefreshCw, Edit2, Trash2, Globe } from 'lucide-react';

export default function ClientTable({ clients, onRenew, onEdit, onDelete }) {
  const getStatusBadge = (status) => {
    switch (status) {
      case 'ACTIVE':
        return (
          <span className="badge badge-active">
            <span className="pulse-dot"></span> Activo
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="badge badge-expired">
            <span className="pulse-dot"></span> Vencido
          </span>
        );
      case 'SUSPENDED':
        return (
          <span className="badge badge-suspended">
            <span className="pulse-dot"></span> Suspendido
          </span>
        );
      default:
        return <span className="badge">{status}</span>;
    }
  };

  const formatCLP = (amount) => {
    if (!amount && amount !== 0) return '$0 CLP';
    const num = Math.round(Number(amount));
    return `$${num.toLocaleString('es-CL')} CLP`;
  };

  const getServiceTypeSpanish = (type) => {
    switch (type) {
      case 'HOSTING_AND_MAINTENANCE':
        return 'Hosting + Mantenimiento Web';
      case 'WEB_HOSTING':
        return 'Hosting Web Único';
      case 'MAINTENANCE':
        return 'Mantenimiento Web Único';
      default:
        return 'Plan Personalizado';
    }
  };

  const getPlanIntervalSpanish = (interval) => {
    switch (interval) {
      case 'MONTHLY':
        return 'Mensual';
      case 'QUARTERLY':
        return 'Trimestral';
      case 'SEMI_ANNUAL':
        return 'Semestral';
      case 'ANNUAL':
        return 'Anual';
      default:
        return interval;
    }
  };

  const getInitials = (name) => {
    if (!name) return 'NK';
    const parts = name.split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  if (!clients || clients.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
        <div style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: '#eff6ff', color: 'var(--brand-indigo)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem auto' }}>
          <Globe size={28} />
        </div>
        <h3 style={{ fontSize: '1.2rem', fontWeight: '800', marginBottom: '0.25rem' }}>No se encontraron sitios web de clientes</h3>
        <p style={{ color: 'var(--text-sub)', fontSize: '0.9rem' }}>Registra tu primer cliente para comenzar la gestión de hosting y suscripciones.</p>
      </div>
    );
  }

  return (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Cliente y Empresa</th>
            <th>Dominio y Servicio</th>
            <th>Plan de Suscripción</th>
            <th>Estado</th>
            <th>Vencimiento</th>
            <th style={{ textAlign: 'right' }}>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {clients.map((client) => (
            <tr key={client.id}>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                  <div className="client-avatar">
                    {getInitials(client.name)}
                  </div>
                  <div>
                    <div style={{ fontWeight: '800', color: 'var(--text-main)', fontSize: '0.95rem' }}>{client.name}</div>
                    {client.company_name && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-sub)', fontWeight: '600' }}>{client.company_name}</div>
                    )}
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{client.email}</div>
                  </div>
                </div>
              </td>
              <td>
                <a
                  href={`http://${client.domain}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    color: 'var(--brand-indigo)',
                    fontWeight: '800',
                    fontSize: '0.925rem',
                    textDecoration: 'none'
                  }}
                >
                  {client.domain} <ExternalLink size={13} />
                </a>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-sub)', marginTop: '0.2rem', fontWeight: '600' }}>
                  {getServiceTypeSpanish(client.service_type)}
                </div>
              </td>
              <td>
                <div style={{ fontWeight: '800', fontSize: '1rem', color: 'var(--text-main)' }}>
                  {formatCLP(client.amount_per_period)}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-sub)', fontWeight: '600' }}>
                  {getPlanIntervalSpanish(client.plan_interval)}
                </div>
              </td>
              <td>{getStatusBadge(client.status)}</td>
              <td>
                <div style={{ fontWeight: '700', fontSize: '0.9rem' }}>
                  {new Date(client.expiration_date).toLocaleDateString('es-CL')}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Gracia: {client.grace_period_days} días
                </div>
              </td>
              <td style={{ textAlign: 'right' }}>
                <div style={{ display: 'flex', gap: '0.45rem', justifyContent: 'flex-end' }}>
                  <button
                    className="btn btn-primary"
                    style={{ padding: '0.45rem 0.85rem', fontSize: '0.825rem' }}
                    onClick={() => onRenew(client)}
                    title="Registrar pago de renovación"
                  >
                    <RefreshCw size={13} /> Renovar
                  </button>
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '0.45rem 0.65rem' }}
                    onClick={() => onEdit(client)}
                    title="Editar Cliente"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '0.45rem 0.65rem', color: '#be123c' }}
                    onClick={() => onDelete(client.id)}
                    title="Eliminar Cliente"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
