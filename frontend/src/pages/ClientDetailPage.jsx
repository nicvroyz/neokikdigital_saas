import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, Server, Database, Mail, Globe, Link2, ShieldCheck, Archive, Settings,
  RefreshCw, Power, Plus, Trash2, Key, Gauge, CheckCircle2, XCircle, Edit2, ExternalLink
} from 'lucide-react';

const SECTIONS = [
  { id: 'summary', label: 'Resumen', icon: Server },
  { id: 'hosting', label: 'Hosting', icon: Server },
  { id: 'domains', label: 'Dominios', icon: Globe },
  { id: 'emails', label: 'Correos', icon: Mail },
  { id: 'aliases', label: 'Alias', icon: Link2 },
  { id: 'ssl', label: 'SSL', icon: ShieldCheck },
  { id: 'backups', label: 'Backups', icon: Archive },
  { id: 'settings', label: 'Configuración', icon: Settings },
];

export default function ClientDetailPage({ token, clients, clientId, onBack, onEditClient }) {
  const client = clients.find(c => c.id === clientId);

  const [activeSection, setActiveSection] = useState('summary');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  const [diskUsage, setDiskUsage] = useState(null);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [sslStatus] = useState({ valid: true, expires_in: '82 días', issuer: "Let's Encrypt" });

  const [domainInfo, setDomainInfo] = useState(null);

  const [emails, setEmails] = useState([]);
  const [newMail, setNewMail] = useState({ local_part: '', password: '', quota: 1024 });
  const [showMailForm, setShowMailForm] = useState(false);
  const [editingMailbox, setEditingMailbox] = useState(null);
  const [editPassword, setEditPassword] = useState('');
  const [editQuota, setEditQuota] = useState(1024);

  const [aliases, setAliases] = useState([]);
  const [newAlias, setNewAlias] = useState({ local_part: '', goto: '' });
  const [showAliasForm, setShowAliasForm] = useState(false);

  const [backups, setBackups] = useState([]);

  const headers = { Authorization: `Bearer ${token}` };
  const jsonHeaders = { ...headers, 'Content-Type': 'application/json' };

  const showFeedback = (msg) => {
    setErrorMessage(null);
    setMessage(msg);
    setTimeout(() => setMessage(null), 4000);
  };

  const showError = (msg) => {
    setMessage(null);
    setErrorMessage(msg);
    setTimeout(() => setErrorMessage(null), 6000);
  };

  useEffect(() => {
    setEditingMailbox(null);
    if (!client) return;
    fetchSectionData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection, clientId]);

  const fetchSectionData = async () => {
    if (!client) return;
    setLoading(true);
    try {
      if (activeSection === 'summary' || activeSection === 'hosting') {
        const res = await fetch(`/api/infrastructure/clients/${clientId}/disk-usage`, { headers });
        if (res.ok) setDiskUsage(await res.json());
      }
      if (activeSection === 'domains' || activeSection === 'summary') {
        const res = await fetch(`/api/clients/${clientId}/domains`, { headers });
        if (res.ok) {
          const data = await res.json();
          setDomainInfo(data.domains?.[0] || null);
        }
      }
      if (activeSection === 'emails' || activeSection === 'summary') {
        const res = await fetch(`/api/clients/${clientId}/emails`, { headers });
        if (res.ok) {
          const data = await res.json();
          setEmails(data.emails || []);
        } else {
          setEmails([]);
        }
      }
      if (activeSection === 'aliases') {
        const res = await fetch(`/api/clients/${clientId}/aliases`, { headers });
        if (res.ok) {
          const data = await res.json();
          setAliases(data.aliases || []);
        } else {
          setAliases([]);
        }
      }
      if (activeSection === 'backups') {
        const res = await fetch(`/api/infrastructure/backups?client_id=${clientId}`, { headers });
        if (res.ok) setBackups(await res.json());
      }
    } catch {
      // network errors surface per-action below; section fetches fail silently into empty states
    } finally {
      setLoading(false);
    }
  };

  if (!client) {
    return (
      <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
        <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>Este cliente ya no existe o fue eliminado.</p>
        <button className="btn btn-secondary" onClick={onBack}><ArrowLeft size={14} /> Volver a Clientes</button>
      </div>
    );
  }

  // ==================== HOSTING ====================

  const handleRestart = async () => {
    try {
      const res = await fetch(`/api/infrastructure/clients/${clientId}/restart`, { method: 'POST', headers });
      if (res.ok) showFeedback('Contenedor del sitio reiniciado correctamente.');
      else showError('No se pudo reiniciar el contenedor.');
    } catch {
      showError('Error de red al reiniciar el contenedor.');
    }
  };

  const handleToggleMaintenance = async () => {
    try {
      const res = await fetch(`/api/infrastructure/clients/${clientId}/maintenance`, {
        method: 'POST', headers: jsonHeaders, body: JSON.stringify({ enabled: !maintenanceMode })
      });
      if (res.ok) {
        setMaintenanceMode(!maintenanceMode);
        showFeedback(maintenanceMode ? 'Modo mantenimiento desactivado.' : 'Modo mantenimiento activado.');
      } else {
        showError('No se pudo cambiar el modo mantenimiento.');
      }
    } catch {
      showError('Error de red al cambiar el modo mantenimiento.');
    }
  };

  // ==================== DOMAINS ====================

  const handleCreateDomain = async () => {
    try {
      const res = await fetch(`/api/clients/${clientId}/domains`, {
        method: 'POST', headers: jsonHeaders, body: JSON.stringify({ domain: client.domain })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showFeedback(`Dominio ${client.domain} creado en Mailcow.`);
        fetchSectionData();
      } else {
        showError(data.error || 'No se pudo crear el dominio en Mailcow.');
      }
    } catch {
      showError('Error de red al crear el dominio.');
    }
  };

  const handleDeleteDomain = async () => {
    if (!window.confirm(`¿Eliminar ${client.domain} de Mailcow? Esto borra TODOS sus buzones y alias. Esta acción no se puede deshacer.`)) return;
    try {
      const res = await fetch(`/api/clients/${clientId}/domains/${encodeURIComponent(client.domain)}`, { method: 'DELETE', headers });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showFeedback(`Dominio ${client.domain} eliminado de Mailcow.`);
        fetchSectionData();
      } else {
        showError(data.error || 'No se pudo eliminar el dominio.');
      }
    } catch {
      showError('Error de red al eliminar el dominio.');
    }
  };

  // ==================== EMAILS ====================

  const handleCreateEmail = async (e) => {
    e.preventDefault();
    if (!newMail.local_part || !newMail.password) return;
    try {
      const res = await fetch(`/api/clients/${clientId}/emails`, {
        method: 'POST', headers: jsonHeaders,
        body: JSON.stringify({ ...newMail, domain: client.domain })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setNewMail({ local_part: '', password: '', quota: 1024 });
        setShowMailForm(false);
        fetchSectionData();
        showFeedback('Cuenta de correo creada en Mailcow.');
      } else {
        showError(data.error || 'No se pudo crear la cuenta de correo.');
      }
    } catch {
      showError('Error de red al crear la cuenta de correo.');
    }
  };

  const handleDeleteEmail = async (addr) => {
    if (!window.confirm(`¿Estás seguro de eliminar el buzón ${addr}?`)) return;
    try {
      const res = await fetch(`/api/clients/${clientId}/emails/${encodeURIComponent(addr)}`, { method: 'DELETE', headers });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        fetchSectionData();
        showFeedback('Buzón de correo eliminado.');
      } else {
        showError(data.error || 'No se pudo eliminar el buzón.');
      }
    } catch {
      showError('Error de red al eliminar el buzón.');
    }
  };

  const handleUpdateEmailPassword = async (e) => {
    e.preventDefault();
    if (!editingMailbox || editPassword.length < 8) return;
    try {
      const res = await fetch(`/api/clients/${clientId}/emails/${encodeURIComponent(editingMailbox.address)}`, {
        method: 'PATCH', headers: jsonHeaders, body: JSON.stringify({ password: editPassword })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setEditingMailbox(null);
        setEditPassword('');
        showFeedback('Contraseña actualizada en Mailcow.');
      } else {
        showError(data.error || 'No se pudo cambiar la contraseña.');
      }
    } catch {
      showError('Error de red al cambiar la contraseña.');
    }
  };

  const handleUpdateEmailQuota = async (e) => {
    e.preventDefault();
    if (!editingMailbox) return;
    try {
      const res = await fetch(`/api/clients/${clientId}/emails/${encodeURIComponent(editingMailbox.address)}`, {
        method: 'PATCH', headers: jsonHeaders, body: JSON.stringify({ quota: editQuota })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setEditingMailbox(null);
        fetchSectionData();
        showFeedback('Cuota actualizada en Mailcow.');
      } else {
        showError(data.error || 'No se pudo cambiar la cuota.');
      }
    } catch {
      showError('Error de red al cambiar la cuota.');
    }
  };

  const handleOpenWebmail = async (address) => {
    try {
      const res = await fetch(`/api/clients/${clientId}/emails/${encodeURIComponent(address)}/webmail-token`, {
        method: 'POST', headers
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) {
        window.open(data.url, '_blank', 'noopener,noreferrer');
      } else {
        showError(data.error || 'No se pudo abrir el Webmail.');
      }
    } catch {
      showError('Error de red al abrir el Webmail.');
    }
  };

  const handleSuspendEmail = async (mail) => {
    try {
      const res = await fetch(`/api/clients/${clientId}/emails/${encodeURIComponent(mail.address)}`, {
        method: 'PATCH', headers: jsonHeaders, body: JSON.stringify({ active: mail.status !== 'ACTIVE' })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        fetchSectionData();
        showFeedback(mail.status === 'ACTIVE' ? 'Buzón suspendido.' : 'Buzón reactivado.');
      } else {
        showError(data.error || 'No se pudo cambiar el estado del buzón.');
      }
    } catch {
      showError('Error de red al cambiar el estado del buzón.');
    }
  };

  // ==================== ALIASES ====================

  const handleCreateAlias = async (e) => {
    e.preventDefault();
    if (!newAlias.local_part || !newAlias.goto) return;
    try {
      const res = await fetch(`/api/clients/${clientId}/aliases`, {
        method: 'POST', headers: jsonHeaders, body: JSON.stringify(newAlias)
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setNewAlias({ local_part: '', goto: '' });
        setShowAliasForm(false);
        fetchSectionData();
        showFeedback('Alias creado en Mailcow.');
      } else {
        showError(data.error || 'No se pudo crear el alias.');
      }
    } catch {
      showError('Error de red al crear el alias.');
    }
  };

  const handleDeleteAlias = async (address) => {
    if (!window.confirm(`¿Eliminar el alias ${address}?`)) return;
    try {
      const res = await fetch(`/api/clients/${clientId}/aliases/${encodeURIComponent(address)}`, { method: 'DELETE', headers });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        fetchSectionData();
        showFeedback('Alias eliminado.');
      } else {
        showError(data.error || 'No se pudo eliminar el alias.');
      }
    } catch {
      showError('Error de red al eliminar el alias.');
    }
  };

  // ==================== SSL ====================

  const handleRenewSSL = async () => {
    try {
      const res = await fetch(`/api/infrastructure/ssl/${client.domain}`, { method: 'POST', headers });
      if (res.ok) showFeedback("Certificado Let's Encrypt SSL renovado exitosamente.");
      else showError('No se pudo renovar el certificado SSL.');
    } catch {
      showError('Error de red al renovar el certificado SSL.');
    }
  };

  // ==================== BACKUPS ====================

  const handleDBBackup = async () => {
    try {
      const res = await fetch(`/api/infrastructure/clients/${clientId}/db/backup`, { method: 'POST', headers });
      if (res.ok) {
        showFeedback('Respaldo SQL de base de datos generado y guardado.');
        fetchSectionData();
      } else {
        showError('No se pudo generar el respaldo.');
      }
    } catch {
      showError('Error de red al generar el respaldo.');
    }
  };

  const handleDBOptimize = async () => {
    try {
      const res = await fetch(`/api/infrastructure/clients/${clientId}/db/optimize`, { method: 'POST', headers });
      if (res.ok) showFeedback('Tablas optimizadas. Se liberó espacio en base de datos.');
      else showError('No se pudo optimizar la base de datos.');
    } catch {
      showError('Error de red al optimizar la base de datos.');
    }
  };

  const cardStyle = { padding: '1.25rem', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' };

  return (
    <div>
      <button className="btn btn-secondary" style={{ marginBottom: '1.25rem' }} onClick={onBack}>
        <ArrowLeft size={14} /> Volver a Clientes
      </button>

      {/* cPanel-style client header */}
      <div className="card" style={{
        background: 'linear-gradient(135deg, #284999 0%, #1e3675 100%)', color: 'white',
        padding: '1.75rem 2rem', marginBottom: '1.75rem', display: 'flex',
        justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.25rem'
      }}>
        <div>
          <div style={{ textTransform: 'uppercase', fontSize: '0.72rem', fontWeight: '800', letterSpacing: '1.2px', color: '#fbb03b' }}>
            ● Administrar Cliente
          </div>
          <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.6rem', fontWeight: '800', margin: '0.25rem 0' }}>
            {client.name}{client.company_name ? ` — ${client.company_name}` : ''}
          </h2>
          <p style={{ opacity: 0.9, fontSize: '0.9rem' }}>{client.domain}</p>
        </div>
        <span style={{
          fontSize: '0.8rem', fontWeight: '800', padding: '0.4rem 0.85rem', borderRadius: '9999px',
          backgroundColor: client.status === 'ACTIVE' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)',
          color: client.status === 'ACTIVE' ? '#4ade80' : '#f87171', border: '1px solid rgba(255,255,255,0.2)'
        }}>
          {client.status}
        </span>
      </div>

      {message && (
        <div style={{ backgroundColor: '#dcfce7', border: '1px solid #bbf7d0', borderRadius: 'var(--radius-md)', padding: '1rem 1.25rem', marginBottom: '1.5rem', color: '#15803d', fontWeight: '700', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <CheckCircle2 size={16} /> {message}
        </div>
      )}
      {errorMessage && (
        <div style={{ backgroundColor: '#fee2e2', border: '1px solid #fecaca', borderRadius: 'var(--radius-md)', padding: '1rem 1.25rem', marginBottom: '1.5rem', color: '#991b1b', fontWeight: '700', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <XCircle size={16} /> {errorMessage}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '1.75rem', alignItems: 'start' }}>
        <div className="card" style={{ padding: '0.75rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {SECTIONS.map(sec => {
              const Icon = sec.icon;
              const isActive = activeSection === sec.id;
              return (
                <button key={sec.id} onClick={() => setActiveSection(sec.id)} style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%',
                  padding: '0.85rem 1.15rem', borderRadius: 'var(--radius-md)', border: 'none',
                  background: isActive ? 'var(--brand-blue)' : 'transparent',
                  color: isActive ? 'white' : 'var(--text-sub)', fontWeight: '700', fontSize: '0.85rem',
                  textAlign: 'left', cursor: 'pointer', transition: 'all 0.2s ease',
                }}>
                  <Icon size={16} /> {sec.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="card" style={{ minHeight: '380px', position: 'relative' }}>
          {loading && (
            <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, borderRadius: 'var(--radius-lg)' }}>
              <RefreshCw size={32} className="spin" color="var(--brand-blue)" />
            </div>
          )}

          {/* RESUMEN */}
          {activeSection === 'summary' && (
            <div>
              <h4 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.15rem', fontWeight: '800', marginBottom: '1.25rem' }}>Resumen del Cliente</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                <div style={cardStyle}>
                  <div style={{ fontSize: '0.75rem', fontWeight: '800', color: 'var(--text-sub)', textTransform: 'uppercase' }}>Dominio Principal</div>
                  <div style={{ fontSize: '1.05rem', fontWeight: '800', marginTop: '0.35rem' }}>{client.domain}</div>
                  <div style={{ fontSize: '0.78rem', color: domainInfo?.mailcow_status === 'PROVISIONED' ? '#059669' : '#b45309', marginTop: '0.2rem', fontWeight: '700' }}>
                    {domainInfo ? (domainInfo.mailcow_status === 'PROVISIONED' ? '● Activo en Mailcow' : '● No provisionado en Mailcow') : 'Cargando...'}
                  </div>
                </div>
                <div style={cardStyle}>
                  <div style={{ fontSize: '0.75rem', fontWeight: '800', color: 'var(--text-sub)', textTransform: 'uppercase' }}>Casillas de Correo</div>
                  <div style={{ fontSize: '1.05rem', fontWeight: '800', marginTop: '0.35rem' }}>{emails.length}</div>
                </div>
                <div style={cardStyle}>
                  <div style={{ fontSize: '0.75rem', fontWeight: '800', color: 'var(--text-sub)', textTransform: 'uppercase' }}>Uso de Disco</div>
                  <div style={{ fontSize: '1.05rem', fontWeight: '800', marginTop: '0.35rem' }}>
                    {diskUsage ? `${diskUsage.used_mb} MB` : 'Cargando...'}
                  </div>
                </div>
                <div style={cardStyle}>
                  <div style={{ fontSize: '0.75rem', fontWeight: '800', color: 'var(--text-sub)', textTransform: 'uppercase' }}>Vencimiento</div>
                  <div style={{ fontSize: '1.05rem', fontWeight: '800', marginTop: '0.35rem' }}>
                    {client.expiration_date ? new Date(client.expiration_date).toLocaleDateString('es-CL') : '—'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* HOSTING */}
          {activeSection === 'hosting' && (
            <div>
              <h4 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.15rem', fontWeight: '800', marginBottom: '1.25rem' }}>Estado y Recursos del Sitio Web</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem', marginBottom: '2rem', maxWidth: '360px' }}>
                <div style={cardStyle}>
                  <div style={{ fontSize: '0.8rem', fontWeight: '800', color: 'var(--text-sub)', textTransform: 'uppercase', marginBottom: '0.55rem' }}>Contenedor Docker</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#22c55e', display: 'inline-block' }}></span>
                    <strong style={{ fontSize: '1.05rem' }}>Activo (En Línea)</strong>
                  </div>
                </div>
              </div>

              {diskUsage && (
                <div style={{ marginBottom: '2rem', padding: '1.25rem', backgroundColor: '#f8fafc', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '800', fontSize: '0.9rem', marginBottom: '0.85rem' }}>
                    <span>Uso de Disco Real</span>
                    <span>{diskUsage.used_mb} MB</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.85rem', fontSize: '0.75rem', color: 'var(--text-sub)' }}>
                    <div>● Sitio Web: <strong>{diskUsage.breakdown.website_files_mb} MB</strong></div>
                    <div>● Base de Datos: <strong>{diskUsage.breakdown.database_mb} MB</strong></div>
                    <div>● Correos: <strong>{diskUsage.breakdown.email_mb} MB</strong></div>
                    <div>● Respaldos: <strong>{diskUsage.breakdown.backups_mb} MB</strong></div>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.85rem', borderTop: '1px solid var(--border-default)', paddingTop: '1.5rem' }}>
                <button className="btn btn-secondary" onClick={handleRestart} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
                  <RefreshCw size={14} /> Reiniciar Sitio Web
                </button>
                <button
                  className={`btn ${maintenanceMode ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={handleToggleMaintenance}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', backgroundColor: maintenanceMode ? '#ef4444' : '', color: maintenanceMode ? '#ffffff' : '' }}
                >
                  <Power size={14} /> {maintenanceMode ? 'Apagar Modo Mantenimiento' : 'Encender Mantenimiento'}
                </button>
              </div>
            </div>
          )}

          {/* DOMINIOS */}
          {activeSection === 'domains' && (
            <div>
              <h4 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.15rem', fontWeight: '800', marginBottom: '1.25rem' }}>Dominios del Cliente</h4>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-sub)', marginBottom: '1.25rem' }}>
                Hoy cada cliente administra un dominio principal. Esta vista está preparada para soportar múltiples dominios más adelante.
              </p>
              {domainInfo && (
                <div style={{ ...cardStyle, maxWidth: '460px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: '800', fontSize: '1.05rem' }}>{domainInfo.domain}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-sub)', marginTop: '0.2rem' }}>Dominio principal</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
                    <span style={{
                      fontSize: '0.75rem', fontWeight: '800', padding: '0.25rem 0.55rem', borderRadius: '4px',
                      color: domainInfo.mailcow_status === 'PROVISIONED' ? '#15803d' : '#b45309',
                      backgroundColor: domainInfo.mailcow_status === 'PROVISIONED' ? '#dcfce7' : '#fffbeb'
                    }}>
                      {domainInfo.mailcow_status === 'PROVISIONED' ? 'En Mailcow' : 'No provisionado'}
                    </span>
                    {domainInfo.mailcow_status === 'PROVISIONED' ? (
                      <button className="btn btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem', color: '#be123c' }} onClick={handleDeleteDomain}>
                        <Trash2 size={13} /> Eliminar de Mailcow
                      </button>
                    ) : (
                      <button className="btn btn-primary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }} onClick={handleCreateDomain}>
                        <Plus size={13} /> Crear en Mailcow
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* CORREOS */}
          {activeSection === 'emails' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h4 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.15rem', fontWeight: '800', margin: 0 }}>Casillas de Correo (Mailcow)</h4>
                <button className="btn btn-secondary" style={{ padding: '0.45rem 0.85rem', fontSize: '0.8rem' }} onClick={() => setShowMailForm(!showMailForm)}>
                  <Plus size={14} /> {showMailForm ? 'Cancelar' : 'Nueva Casilla'}
                </button>
              </div>

              {showMailForm && (
                <form onSubmit={handleCreateEmail} className="card" style={{ border: '1px solid var(--brand-blue)', padding: '1.25rem', marginBottom: '1.5rem' }}>
                  <h5 style={{ fontWeight: '800', fontSize: '0.95rem', margin: '0 0 1rem 0' }}>Crear Nuevo Buzón</h5>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '1rem', marginBottom: '1rem' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Usuario</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <input type="text" className="form-input" placeholder="nombre" value={newMail.local_part}
                          onChange={(e) => setNewMail(prev => ({ ...prev, local_part: e.target.value }))} />
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-sub)' }}>@{client.domain}</span>
                      </div>
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Contraseña</label>
                      <input type="password" className="form-input" placeholder="Clave segura..." value={newMail.password}
                        onChange={(e) => setNewMail(prev => ({ ...prev, password: e.target.value }))} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Cuota de Almacenamiento (MB): {newMail.quota} MB</label>
                    <input type="range" min="128" max="5120" step="128" style={{ width: '100%' }} value={newMail.quota}
                      onChange={(e) => setNewMail(prev => ({ ...prev, quota: Number(e.target.value) }))} />
                  </div>
                  <button type="submit" className="btn btn-primary" style={{ padding: '0.55rem 1.15rem', fontSize: '0.85rem' }}>Guardar Casilla</button>
                </form>
              )}

              {emails.length === 0 && !loading && (
                <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  Este cliente no tiene casillas de correo en Mailcow para {client.domain}.
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {emails.map((mail, idx) => {
                  const isActive = mail.status === 'ACTIVE';
                  const isEditingThis = editingMailbox?.address === mail.address;
                  const pct = mail.quota_mb > 0 ? ((mail.used_mb / mail.quota_mb) * 100).toFixed(1) : '0.0';
                  return (
                    <div key={idx} style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', backgroundColor: '#ffffff' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                        <div>
                          <div style={{ fontWeight: '800', fontSize: '0.925rem', color: 'var(--text-main)' }}>{mail.address}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-sub)', marginTop: '0.2rem' }}>
                            Cuota: {mail.used_mb} MB / {mail.quota_mb} MB ({pct}%)
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: '800', color: isActive ? '#15803d' : '#991b1b', backgroundColor: isActive ? '#dcfce7' : '#fee2e2', padding: '0.25rem 0.55rem', borderRadius: '4px' }}>
                            {isActive ? 'Activo' : 'Inactivo'}
                          </span>
                          <button className="copy-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.25rem 0.55rem', fontSize: '0.75rem' }}
                            onClick={() => handleOpenWebmail(mail.address)} disabled={!isActive} title={isActive ? 'Abrir Webmail sin contraseña' : 'Buzón suspendido'}>
                            <ExternalLink size={13} /> Webmail
                          </button>
                          <button className="copy-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.25rem 0.55rem', fontSize: '0.75rem' }}
                            onClick={() => { setEditPassword(''); setEditingMailbox(isEditingThis && editingMailbox.mode === 'password' ? null : { address: mail.address, mode: 'password' }); }}>
                            <Key size={13} /> Contraseña
                          </button>
                          <button className="copy-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.25rem 0.55rem', fontSize: '0.75rem' }}
                            onClick={() => { setEditQuota(mail.quota_mb || 1024); setEditingMailbox(isEditingThis && editingMailbox.mode === 'quota' ? null : { address: mail.address, mode: 'quota' }); }}>
                            <Gauge size={13} /> Cuota
                          </button>
                          <button className="copy-btn" style={{ padding: '0.25rem 0.55rem', fontSize: '0.75rem' }} onClick={() => handleSuspendEmail(mail)}>
                            {isActive ? 'Suspender' : 'Reactivar'}
                          </button>
                          <button onClick={() => handleDeleteEmail(mail.address)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444', padding: '0.25rem' }} title="Eliminar casilla">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>

                      {isEditingThis && editingMailbox.mode === 'password' && (
                        <form onSubmit={handleUpdateEmailPassword} style={{ padding: '0 1.25rem 1.25rem', display: 'flex', gap: '0.65rem', alignItems: 'flex-end' }}>
                          <div className="form-group" style={{ margin: 0, flex: 1 }}>
                            <label className="form-label">Nueva contraseña (mín. 8 caracteres)</label>
                            <input type="password" className="form-input" placeholder="Nueva clave segura..." value={editPassword} onChange={(e) => setEditPassword(e.target.value)} autoFocus />
                          </div>
                          <button type="submit" className="btn btn-primary" style={{ padding: '0.55rem 1.1rem', fontSize: '0.8rem' }} disabled={editPassword.length < 8}>Guardar</button>
                          <button type="button" className="btn btn-secondary" style={{ padding: '0.55rem 0.85rem', fontSize: '0.8rem' }} onClick={() => setEditingMailbox(null)}>Cancelar</button>
                        </form>
                      )}

                      {isEditingThis && editingMailbox.mode === 'quota' && (
                        <form onSubmit={handleUpdateEmailQuota} style={{ padding: '0 1.25rem 1.25rem', display: 'flex', gap: '0.65rem', alignItems: 'flex-end' }}>
                          <div className="form-group" style={{ margin: 0, flex: 1 }}>
                            <label className="form-label">Nueva cuota: {editQuota} MB</label>
                            <input type="range" min="128" max="10240" step="128" style={{ width: '100%' }} value={editQuota} onChange={(e) => setEditQuota(Number(e.target.value))} />
                          </div>
                          <button type="submit" className="btn btn-primary" style={{ padding: '0.55rem 1.1rem', fontSize: '0.8rem' }}>Guardar</button>
                          <button type="button" className="btn btn-secondary" style={{ padding: '0.55rem 0.85rem', fontSize: '0.8rem' }} onClick={() => setEditingMailbox(null)}>Cancelar</button>
                        </form>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ALIAS */}
          {activeSection === 'aliases' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h4 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.15rem', fontWeight: '800', margin: 0 }}>Alias de Correo (Mailcow)</h4>
                <button className="btn btn-secondary" style={{ padding: '0.45rem 0.85rem', fontSize: '0.8rem' }} onClick={() => setShowAliasForm(!showAliasForm)}>
                  <Plus size={14} /> {showAliasForm ? 'Cancelar' : 'Nuevo Alias'}
                </button>
              </div>

              {showAliasForm && (
                <form onSubmit={handleCreateAlias} className="card" style={{ border: '1px solid var(--brand-blue)', padding: '1.25rem', marginBottom: '1.5rem' }}>
                  <h5 style={{ fontWeight: '800', fontSize: '0.95rem', margin: '0 0 1rem 0' }}>Crear Nuevo Alias</h5>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '1rem', marginBottom: '1rem' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Alias</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <input type="text" className="form-input" placeholder="ventas" value={newAlias.local_part}
                          onChange={(e) => setNewAlias(prev => ({ ...prev, local_part: e.target.value }))} />
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-sub)' }}>@{client.domain}</span>
                      </div>
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Redirige a</label>
                      <input type="email" className="form-input" placeholder="destino@correo.com" value={newAlias.goto}
                        onChange={(e) => setNewAlias(prev => ({ ...prev, goto: e.target.value }))} />
                    </div>
                  </div>
                  <button type="submit" className="btn btn-primary" style={{ padding: '0.55rem 1.15rem', fontSize: '0.85rem' }}>Guardar Alias</button>
                </form>
              )}

              {aliases.length === 0 && !loading && (
                <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  Este cliente no tiene alias configurados para {client.domain}.
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {aliases.map((alias, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontWeight: '800', fontSize: '0.9rem' }}>
                      {alias.address} <span style={{ color: 'var(--text-sub)', fontWeight: '600' }}>→</span> {alias.goto}
                    </div>
                    <button onClick={() => handleDeleteAlias(alias.address)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444', padding: '0.25rem' }} title="Eliminar alias">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SSL */}
          {activeSection === 'ssl' && (
            <div>
              <h4 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.15rem', fontWeight: '800', marginBottom: '1.25rem' }}>Certificado SSL</h4>
              <div style={{ ...cardStyle, maxWidth: '420px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginBottom: '0.85rem' }}>
                  <ShieldCheck size={18} color="#22c55e" />
                  <strong style={{ fontSize: '1.05rem', color: '#15803d' }}>Seguro (HTTPS)</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: 'var(--text-sub)' }}>
                  <span>Expira en {sslStatus.expires_in} · {sslStatus.issuer}</span>
                  <button className="copy-btn" onClick={handleRenewSSL} style={{ padding: '0.2rem 0.55rem' }}>Renovar</button>
                </div>
              </div>
            </div>
          )}

          {/* BACKUPS */}
          {activeSection === 'backups' && (
            <div>
              <h4 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.15rem', fontWeight: '800', marginBottom: '1.25rem' }}>Copias de Seguridad</h4>

              <div style={{ padding: '1.5rem', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', backgroundColor: '#f8fafc', marginBottom: '1.5rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-sub)' }}>Nombre base de datos:</div>
                    <strong style={{ fontSize: '1rem' }}>wordpress_db</strong>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-sub)' }}>Cotejamiento / Charset:</div>
                    <strong style={{ fontSize: '1rem' }}>utf8mb4_unicode_ci</strong>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.85rem', borderTop: '1px solid var(--border-default)', paddingTop: '1.25rem' }}>
                  <button className="btn btn-primary" onClick={handleDBBackup} style={{ backgroundColor: 'var(--brand-yellow)', borderColor: 'var(--brand-yellow)', color: '#0f172a', fontWeight: '800' }}>
                    Crear Respaldo DB
                  </button>
                  <button className="btn btn-secondary" onClick={handleDBOptimize}>Optimizar Tablas</button>
                </div>
              </div>

              {backups.length === 0 && !loading && (
                <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  No hay respaldos registrados para este cliente.
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {backups.map((b) => (
                  <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.85rem 1.1rem', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}>
                    <div>
                      <div style={{ fontWeight: '700', fontSize: '0.88rem' }}>{b.filename}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-sub)' }}>{new Date(b.created_at).toLocaleString('es-CL')}</div>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{b.backup_type}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CONFIGURACIÓN */}
          {activeSection === 'settings' && (
            <div>
              <h4 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.15rem', fontWeight: '800', marginBottom: '1.25rem' }}>Configuración del Cliente</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                <div style={cardStyle}>
                  <div style={{ fontSize: '0.75rem', fontWeight: '800', color: 'var(--text-sub)', textTransform: 'uppercase' }}>Correo de Contacto</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: '700', marginTop: '0.35rem' }}>{client.email}</div>
                </div>
                <div style={cardStyle}>
                  <div style={{ fontSize: '0.75rem', fontWeight: '800', color: 'var(--text-sub)', textTransform: 'uppercase' }}>Plan</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: '700', marginTop: '0.35rem' }}>{client.plan_interval}</div>
                </div>
                <div style={cardStyle}>
                  <div style={{ fontSize: '0.75rem', fontWeight: '800', color: 'var(--text-sub)', textTransform: 'uppercase' }}>Días de Gracia</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: '700', marginTop: '0.35rem' }}>{client.grace_period_days} días</div>
                </div>
              </div>
              <button className="btn btn-primary" onClick={() => onEditClient(client)}>
                <Edit2 size={14} /> Editar Datos del Cliente
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
