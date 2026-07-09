import React, { useState } from 'react';
import { Search, Plus, Filter, RefreshCw, Edit2, Trash2, ExternalLink, ShieldAlert, CheckCircle, Clock, AlertTriangle, Copy, Check } from 'lucide-react';
import ClientTable from '../components/ClientTable';

export default function ClientsPage({ clients, activeFilter, setActiveFilter, onAddClient, onEdit, onRenew, onDelete }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedDomain, setCopiedDomain] = useState(null);

  const filteredClients = clients.filter((client) => {
    const matchesFilter = activeFilter === 'ALL' || client.status === activeFilter;
    const matchesSearch =
      client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.domain.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (client.company_name && client.company_name.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesFilter && matchesSearch;
  });

  const activeCount = clients.filter(c => c.status === 'ACTIVE').length;
  const expiredCount = clients.filter(c => c.status === 'EXPIRED').length;
  const suspendedCount = clients.filter(c => c.status === 'SUSPENDED').length;

  const handleCopyDomain = (domain) => {
    navigator.clipboard.writeText(domain);
    setCopiedDomain(domain);
    setTimeout(() => setCopiedDomain(null), 2000);
  };

  return (
    <div>
      {/* Top Header */}
      <div className="top-header">
        <div className="page-title">
          <h1>Directorio y Operaciones de Clientes</h1>
          <p>Gestión completa de dominios web, estados de suscripción y ciclo de renovación recurrente</p>
        </div>
        <button className="btn btn-primary" onClick={onAddClient}>
          <Plus size={16} /> Registrar Nuevo Sitio Web
        </button>
      </div>

      {/* Quick Summary Pill Bar */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.75rem', flexWrap: 'wrap' }}>
        <div style={{ padding: '0.65rem 1.15rem', backgroundColor: '#ffffff', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-sub)', boxShadow: 'var(--shadow-xs)' }}>
          📊 Total Clientes: <strong style={{ color: 'var(--text-main)' }}>{clients.length}</strong>
        </div>
        <div style={{ padding: '0.65rem 1.15rem', backgroundColor: '#f0fdf4', borderRadius: 'var(--radius-md)', border: '1px solid #bbf7d0', fontSize: '0.85rem', fontWeight: '700', color: '#15803d' }}>
          ● Activos: <strong>{activeCount}</strong>
        </div>
        <div style={{ padding: '0.65rem 1.15rem', backgroundColor: '#fffbeb', borderRadius: 'var(--radius-md)', border: '1px solid #fde68a', fontSize: '0.85rem', fontWeight: '700', color: '#b45309' }}>
          ⚠️ En Gracia: <strong>{expiredCount}</strong>
        </div>
        <div style={{ padding: '0.65rem 1.15rem', backgroundColor: '#fff1f2', borderRadius: 'var(--radius-md)', border: '1px solid #fecaca', fontSize: '0.85rem', fontWeight: '700', color: '#be123c' }}>
          🚫 Suspendidos: <strong>{suspendedCount}</strong>
        </div>
      </div>

      {/* Controls & Filter Bar */}
      <div className="controls-bar">
        <div className="search-input-wrapper">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Buscar por cliente, dominio (.cl), empresa o correo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Filter Segment Tabs */}
        <div className="filter-tabs">
          <button
            className={`tab-btn ${activeFilter === 'ALL' ? 'active' : ''}`}
            onClick={() => setActiveFilter('ALL')}
          >
            Todos ({clients.length})
          </button>
          <button
            className={`tab-btn ${activeFilter === 'ACTIVE' ? 'active' : ''}`}
            onClick={() => setActiveFilter('ACTIVE')}
          >
            Activos ({activeCount})
          </button>
          <button
            className={`tab-btn ${activeFilter === 'EXPIRED' ? 'active' : ''}`}
            onClick={() => setActiveFilter('EXPIRED')}
          >
            Vencidos ({expiredCount})
          </button>
          <button
            className={`tab-btn ${activeFilter === 'SUSPENDED' ? 'active' : ''}`}
            onClick={() => setActiveFilter('SUSPENDED')}
          >
            Suspendidos ({suspendedCount})
          </button>
        </div>
      </div>

      {/* Client Directory Table */}
      {filteredClients.length === 0 ? (
        <div className="card" style={{ padding: '4rem 2rem', textAlign: 'center' }}>
          <div style={{ width: '60px', height: '60px', borderRadius: '50%', backgroundColor: '#f1f5f9', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem', color: 'var(--text-muted)' }}>
            <Search size={28} />
          </div>
          <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.25rem', fontWeight: '800', color: 'var(--text-main)', marginBottom: '0.4rem' }}>
            No se encontraron clientes
          </h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-sub)', maxWidth: '400px', margin: '0 auto 1.5rem' }}>
            No hay ningún registro que coincida con el criterio de búsqueda o filtro seleccionado.
          </p>
          <button className="btn btn-secondary" onClick={() => { setSearchTerm(''); setActiveFilter('ALL'); }}>
            Limpiar Filtros de Búsqueda
          </button>
        </div>
      ) : (
        <ClientTable
          clients={filteredClients}
          onEdit={onEdit}
          onRenew={onRenew}
          onDelete={onDelete}
        />
      )}
    </div>
  );
}
