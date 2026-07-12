import React from 'react';
import { LayoutDashboard, Users, Server, Settings, LogOut, Zap, Briefcase, Send, HardDrive, Folder } from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab, onLogout, onTriggerAudit, clientsCount }) {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'clients', label: 'Clientes', icon: Users, badge: clientsCount !== undefined ? String(clientsCount) : '0' },
    { id: 'operations', label: 'Workload', icon: Briefcase },
    { id: 'communications', label: 'Comunicaciones', icon: Send },
    { id: 'hosting', label: 'Servidor', icon: Server },
    { id: 'infrastructure', label: 'Infraestructura', icon: HardDrive },
    { id: 'files-admin', label: 'Administrar Archivos', icon: Folder, externalUrl: 'https://files.jacvroyz.cl' },
    { id: 'settings', label: 'Configuración', icon: Settings },
  ];

  return (
    <aside className="sidebar">
      {/* Instagram-Style Circular Avatar Logo */}
      <div className="brand-logo-container">
        <div className="brand-avatar-circle">
          <img
            src="/logo.svg"
            alt="Neokik Digital Logo"
            className="brand-avatar-img"
          />
        </div>
        <div className="brand-text-block">
          <div className="brand-name-title">NEOKIK</div>
          <div className="brand-name-subtitle">DIGITAL</div>
        </div>
      </div>

      <div style={{ padding: '0 0.25rem 1.25rem 0.25rem' }}>
        <div style={{
          backgroundColor: '#ecfdf5',
          border: '1px solid #a7f3d0',
          borderRadius: 'var(--radius-md)',
          padding: '0.65rem 0.85rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          fontSize: '0.78rem',
          fontWeight: '800',
          color: '#15803d'
        }}>
          <span className="pulse-dot" style={{ backgroundColor: '#22c55e', animation: 'pulseDot 2s infinite' }}></span>
          Proxy VPS En Línea
        </div>
      </div>

      <nav className="nav-group">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={`nav-link ${activeTab === item.id && !item.externalUrl ? 'active' : ''}`}
              onClick={() => {
                if (item.externalUrl) {
                  const newWindow = window.open(item.externalUrl, '_blank');
                  if (!newWindow) {
                    window.location.href = item.externalUrl;
                  }
                  return;
                }
                setActiveTab(item.id);
              }}
            >
              <div className="nav-link-content">
                <Icon size={19} />
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span className="nav-badge">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
        <button
          className="btn btn-secondary"
          style={{ width: '100%', fontSize: '0.85rem', padding: '0.65rem' }}
          onClick={onTriggerAudit}
        >
          <Zap size={16} color="var(--brand-yellow)" /> Ejecutar Auditoría Cron
        </button>

        <button
          className="btn btn-secondary"
          style={{ width: '100%', fontSize: '0.85rem', color: '#be123c', padding: '0.65rem' }}
          onClick={onLogout}
        >
          <LogOut size={16} /> Cerrar Sesión
        </button>
      </div>
    </aside>
  );
}
