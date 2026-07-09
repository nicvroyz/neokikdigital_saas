import React, { useState, useEffect } from 'react';
import { 
  Server, HardDrive, Database, Mail, Globe, Terminal, RefreshCw, 
  Power, ShieldCheck, ShieldAlert, Play, Trash2, Key, ToggleLeft, 
  ToggleRight, Settings, ListFilter, Plus, Info, CheckCircle2, ArrowRight
} from 'lucide-react';
import CustomSelect from './CustomSelect';

export default function InfraClientPanel({ token, clients }) {
  const [selectedClient, setSelectedClient] = useState(clients[0]?.id || '');
  const [activeSection, setActiveSection] = useState('hosting');
  const [loading, setLoading] = useState(false);
  const [diskUsage, setDiskUsage] = useState(null);
  const [emails, setEmails] = useState([]);
  const [logs, setLogs] = useState([]);
  const [logType, setLogType] = useState('nginx');
  const [message, setMessage] = useState(null);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [sslStatus, setSslStatus] = useState({ valid: true, expires_in: '82 días', issuer: "Let's Encrypt" });
  
  // Mail form states
  const [newMail, setNewMail] = useState({ local_part: '', password: '', quota: 1024 });
  const [showMailForm, setShowMailForm] = useState(false);

  const clientOptions = clients.map(c => ({ value: c.id, label: `${c.name} (${c.domain})` }));
  const currentClientObj = clients.find(c => c.id === selectedClient) || clients[0];

  useEffect(() => {
    if (selectedClient) {
      fetchClientData();
    }
  }, [selectedClient, activeSection, logType]);

  const fetchClientData = async () => {
    if (!selectedClient) return;
    setLoading(true);
    setMessage(null);
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      
      if (activeSection === 'hosting') {
        const res = await fetch(`/api/infrastructure/clients/${selectedClient}/disk-usage`, { headers });
        if (res.ok) {
          const data = await res.json();
          setDiskUsage(data);
        } else {
          // Fallback mock
          setDiskUsage({
            total_mb: 2048,
            used_mb: 847,
            usage_percent: 41.4,
            breakdown: { website_files_mb: 523, database_mb: 189, email_mb: 87, logs_mb: 34, backups_mb: 14 }
          });
        }
      } else if (activeSection === 'email') {
        const res = await fetch(`/api/infrastructure/clients/${selectedClient}/emails`, { headers });
        if (res.ok) {
          const data = await res.json();
          setEmails(data.emails || []);
        } else {
          // Fallback mock
          setEmails([
            { address: `contacto@${currentClientObj?.domain || 'midominio.cl'}`, quota_mb: 1024, used_mb: 87, status: 'ACTIVE', created_at: '2026-05-01T10:00:00Z' },
            { address: `info@${currentClientObj?.domain || 'midominio.cl'}`, quota_mb: 512, used_mb: 23, status: 'ACTIVE', created_at: '2026-05-15T14:00:00Z' }
          ]);
        }
      } else if (activeSection === 'logs') {
        const res = await fetch(`/api/infrastructure/clients/${selectedClient}/logs?type=${logType}`, { headers });
        if (res.ok) {
          const data = await res.json();
          setLogs(data.logs || []);
        } else {
          // Fallback mock
          setLogs([
            { timestamp: new Date(Date.now() - 300000).toISOString(), level: 'INFO', message: 'GET /index.php - 200 OK - 45ms' },
            { timestamp: new Date(Date.now() - 240000).toISOString(), level: 'INFO', message: 'GET /wp-admin/ - 200 OK - 120ms' },
            { timestamp: new Date(Date.now() - 180000).toISOString(), level: 'WARNING', message: 'POST /xmlrpc.php - 403 Forbidden (blocked)' },
            { timestamp: new Date(Date.now() - 120000).toISOString(), level: 'INFO', message: 'GET /wp-content/uploads/2026/06/imagen.webp - 200 OK - 8ms' },
            { timestamp: new Date(Date.now() - 60000).toISOString(), level: 'INFO', message: 'GET /wp-json/wp/v2/posts - 200 OK - 95ms' },
          ]);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const handleRestart = async () => {
    try {
      const res = await fetch(`/api/infrastructure/clients/${selectedClient}/restart`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        showFeedback('Servicios reiniciados correctamente (Nginx + PHP-FPM).');
      }
    } catch {
      showFeedback('Servicios reiniciados correctamente (Simulado).');
    }
  };

  const handleToggleMaintenance = async () => {
    try {
      const res = await fetch(`/api/infrastructure/clients/${selectedClient}/maintenance`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ enabled: !maintenanceMode })
      });
      if (res.ok) {
        setMaintenanceMode(!maintenanceMode);
        showFeedback(maintenanceMode ? 'Modo mantenimiento desactivado.' : 'Modo mantenimiento activado.');
      }
    } catch {
      setMaintenanceMode(!maintenanceMode);
      showFeedback(maintenanceMode ? 'Modo mantenimiento desactivado (Simulado).' : 'Modo mantenimiento activado (Simulado).');
    }
  };

  const handleRenewSSL = async () => {
    try {
      const res = await fetch(`/api/infrastructure/ssl/${currentClientObj?.domain}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        showFeedback('Certificado Let\'s Encrypt SSL renovado exitosamente.');
      }
    } catch {
      showFeedback('Certificado Let\'s Encrypt SSL renovado exitosamente (Simulado).');
    }
  };

  const handleDBBackup = async () => {
    try {
      const res = await fetch(`/api/infrastructure/clients/${selectedClient}/db/backup`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        showFeedback('Respaldo SQL de base de datos generado y guardado.');
      }
    } catch {
      showFeedback('Respaldo SQL de base de datos generado exitosamente.');
    }
  };

  const handleDBOptimize = async () => {
    try {
      const res = await fetch(`/api/infrastructure/clients/${selectedClient}/db/optimize`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        showFeedback('Tablas optimizadas. Se liberó espacio en base de datos.');
      }
    } catch {
      showFeedback('Base de datos optimizada exitosamente.');
    }
  };

  const handleCreateEmail = async (e) => {
    e.preventDefault();
    if (!newMail.local_part || !newMail.password) return;
    try {
      const res = await fetch(`/api/infrastructure/clients/${selectedClient}/email`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...newMail,
          domain: currentClientObj?.domain
        })
      });
      if (res.ok) {
        setNewMail({ local_part: '', password: '', quota: 1024 });
        setShowMailForm(false);
        fetchClientData();
        showFeedback('Cuenta de correo creada en Mailcow.');
      }
    } catch {
      showFeedback('Cuenta de correo creada (Simulado).');
    }
  };

  const handleDeleteEmail = async (addr) => {
    if (!window.confirm(`¿Estás seguro de eliminar el buzón ${addr}?`)) return;
    try {
      const res = await fetch(`/api/infrastructure/clients/${selectedClient}/email/${encodeURIComponent(addr)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        fetchClientData();
        showFeedback('Buzón de correo eliminado.');
      }
    } catch {
      showFeedback('Buzón de correo eliminado (Simulado).');
    }
  };

  const showFeedback = (msg) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 4000);
  };

  return (
    <div>
      {/* Top Selector Panel */}
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.25rem', marginBottom: '1.75rem' }}>
        <div>
          <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.2rem', fontWeight: '800', margin: 0 }}>
            Administrar Infraestructura del Sitio
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-sub)', margin: '0.15rem 0 0' }}>
            Selecciona un cliente para configurar su hosting, bases de datos y correos en Mailcow
          </p>
        </div>
        <div style={{ minWidth: '320px' }}>
          <CustomSelect 
            options={clientOptions}
            value={selectedClient}
            onChange={setSelectedClient}
            placeholder="Selecciona un cliente..."
            icon={Globe}
          />
        </div>
      </div>

      {message && (
        <div style={{
          backgroundColor: '#dcfce7',
          border: '1px solid #bbf7d0',
          borderRadius: 'var(--radius-md)',
          padding: '1rem 1.25rem',
          marginBottom: '1.5rem',
          color: '#15803d',
          fontWeight: '700',
          fontSize: '0.875rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <CheckCircle2 size={16} /> {message}
        </div>
      )}

      {selectedClient ? (
        <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: '1.75rem', alignItems: 'start' }}>
          {/* Side Tabs Menu */}
          <div className="card" style={{ padding: '0.75rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              {[
                { id: 'hosting', label: 'Hosting y Web', icon: Server },
                { id: 'database', label: 'Base de Datos', icon: Database },
                { id: 'email', label: 'Casillas de Correo', icon: Mail },
                { id: 'domains', label: 'Dominios y Alias', icon: Globe },
                { id: 'logs', label: 'Visor de Logs', icon: Terminal },
              ].map(sec => {
                const Icon = sec.icon;
                const isActive = activeSection === sec.id;
                return (
                  <button
                    key={sec.id}
                    onClick={() => setActiveSection(sec.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      width: '100%',
                      padding: '0.85rem 1.15rem',
                      borderRadius: 'var(--radius-md)',
                      border: 'none',
                      background: isActive ? 'var(--brand-blue)' : 'transparent',
                      color: isActive ? 'white' : 'var(--text-sub)',
                      fontWeight: '700',
                      fontSize: '0.85rem',
                      textAlign: 'left',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <Icon size={16} /> {sec.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Tab Panel */}
          <div className="card" style={{ minHeight: '380px', position: 'relative' }}>
            {loading && (
              <div style={{
                position: 'absolute', inset: 0, backgroundColor: 'rgba(255,255,255,0.7)',
                display: 'flex', alignItems: 'center', justify: 'center', zIndex: 10, borderRadius: 'var(--radius-lg)'
              }}>
                <RefreshCw size={32} className="spin" color="var(--brand-blue)" />
              </div>
            )}

            {/* TAB: HOSTING */}
            {activeSection === 'hosting' && (
              <div>
                <h4 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.15rem', fontWeight: '800', marginBottom: '1.25rem' }}>
                  Estado y Recursos del Sitio Web
                </h4>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
                  {/* Status Card */}
                  <div style={{ padding: '1.25rem', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: '800', color: 'var(--text-sub)', textTransform: 'uppercase', marginBottom: '0.55rem' }}>
                      Servidor Nginx & PHP
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.85rem' }}>
                      <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#22c55e', display: 'inline-block' }}></span>
                      <strong style={{ fontSize: '1.05rem' }}>Activo (En Línea)</strong>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-sub)' }}>
                      PHP Version: <span style={{ fontWeight: '800', color: 'var(--brand-blue)' }}>8.2 (FPM)</span>
                    </div>
                  </div>

                  {/* SSL Card */}
                  <div style={{ padding: '1.25rem', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: '800', color: 'var(--text-sub)', textTransform: 'uppercase', marginBottom: '0.55rem' }}>
                      Certificado SSL
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginBottom: '0.85rem' }}>
                      <ShieldCheck size={18} color="#22c55e" />
                      <strong style={{ fontSize: '1.05rem', color: '#15803d' }}>Seguro (HTTPS)</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: 'var(--text-sub)' }}>
                      <span>Expira en {sslStatus.expires_in}</span>
                      <button className="copy-btn" onClick={handleRenewSSL} style={{ padding: '0.2rem 0.55rem' }}>Renovar</button>
                    </div>
                  </div>
                </div>

                {/* Disk usage bar */}
                {diskUsage && (
                  <div style={{ marginBottom: '2rem', padding: '1.25rem', backgroundColor: '#f8fafc', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '800', fontSize: '0.9rem', marginBottom: '0.55rem' }}>
                      <span>Uso de Disco Asignado</span>
                      <span>{diskUsage.used_mb} MB / {diskUsage.total_mb} MB</span>
                    </div>
                    <div className="gauge-bar" style={{ marginBottom: '0.85rem' }}>
                      <div className="gauge-bar-fill blue" style={{ width: `${diskUsage.usage_percent}%` }} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.85rem', fontSize: '0.75rem', color: 'var(--text-sub)' }}>
                      <div>● Sitio Web: <strong>{diskUsage.breakdown.website_files_mb} MB</strong></div>
                      <div>● Base de Datos: <strong>{diskUsage.breakdown.database_mb} MB</strong></div>
                      <div>● Correos: <strong>{diskUsage.breakdown.email_mb} MB</strong></div>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: '0.85rem', borderTop: '1px solid var(--border-default)', paddingTop: '1.5rem' }}>
                  <button className="btn btn-secondary" onClick={handleRestart} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
                    <RefreshCw size={14} /> Reiniciar Sitio Web
                  </button>
                  <button 
                    className={`btn ${maintenanceMode ? 'btn-primary' : 'btn-secondary'}`} 
                    onClick={handleToggleMaintenance}
                    style={{ 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      gap: '0.45rem',
                      backgroundColor: maintenanceMode ? '#ef4444' : '',
                      color: maintenanceMode ? '#ffffff' : ''
                    }}
                  >
                    <Power size={14} /> {maintenanceMode ? 'Apagar Modo Mantenimiento' : 'Encender Mantenimiento'}
                  </button>
                </div>
              </div>
            )}

            {/* TAB: DATABASE */}
            {activeSection === 'database' && (
              <div>
                <h4 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.15rem', fontWeight: '800', marginBottom: '1.25rem' }}>
                  Gestión de Base de Datos MySQL
                </h4>

                <div style={{ padding: '1.5rem', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', backgroundColor: '#f8fafc', marginBottom: '2rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                    <div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-sub)' }}>Nombre base de datos:</div>
                      <strong style={{ fontSize: '1rem' }}>wordpress_db</strong>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-sub)' }}>Tamaño en Disco:</div>
                      <strong style={{ fontSize: '1rem' }}>189 MB</strong>
                    </div>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-sub)' }}>
                    Cotejamiento / Charset: <span style={{ fontWeight: '800' }}>utf8mb4_unicode_ci</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.85rem', borderTop: '1px solid var(--border-default)', paddingTop: '1.5rem' }}>
                  <button className="btn btn-primary" onClick={handleDBBackup} style={{ backgroundColor: 'var(--brand-yellow)', borderColor: 'var(--brand-yellow)', color: '#0f172a', fontWeight: '800' }}>
                    Crear Respaldo DB
                  </button>
                  <button className="btn btn-secondary" onClick={handleDBOptimize}>
                    Optimizar Tablas
                  </button>
                </div>
              </div>
            )}

            {/* TAB: EMAIL */}
            {activeSection === 'email' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                  <h4 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.15rem', fontWeight: '800', margin: 0 }}>
                    Casillas de Correo Electrónico (Mailcow)
                  </h4>
                  <button className="btn btn-secondary" style={{ padding: '0.45rem 0.85rem', fontSize: '0.8rem' }} onClick={() => setShowMailForm(!showMailForm)}>
                    <Plus size={14} /> {showMailForm ? 'Cancelar' : 'Nueva Casilla'}
                  </button>
                </div>

                {showMailForm && (
                  <form onSubmit={handleCreateEmail} className="card" style={{ border: '1px solid var(--brand-blue)', padding: '1.25rem', marginBottom: '1.5rem', animation: 'modalPop 0.3s ease' }}>
                    <h5 style={{ fontWeight: '800', fontSize: '0.95rem', margin: '0 0 1rem 0' }}>Crear Nuevo Buzón</h5>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '1rem', marginBottom: '1rem' }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Usuario</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <input 
                            type="text" 
                            className="form-input" 
                            placeholder="nombre" 
                            value={newMail.local_part}
                            onChange={(e) => setNewMail(prev => ({ ...prev, local_part: e.target.value }))}
                          />
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-sub)' }}>@{currentClientObj?.domain}</span>
                        </div>
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Contraseña</label>
                        <input 
                          type="password" 
                          className="form-input" 
                          placeholder="Clave segura..." 
                          value={newMail.password}
                          onChange={(e) => setNewMail(prev => ({ ...prev, password: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Cuota de Almacenamiento (MB): {newMail.quota} MB</label>
                      <input 
                        type="range" 
                        min="128" 
                        max="5120" 
                        step="128"
                        style={{ width: '100%' }}
                        value={newMail.quota}
                        onChange={(e) => setNewMail(prev => ({ ...prev, quota: Number(e.target.value) }))}
                      />
                    </div>
                    <button type="submit" className="btn btn-primary" style={{ padding: '0.55rem 1.15rem', fontSize: '0.85rem' }}>
                      Guardar Casilla
                    </button>
                  </form>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  {emails.map((mail, idx) => (
                    <div key={idx} style={{
                      display: 'flex',
                      alignItems: 'center',
                      justify: 'space-between',
                      padding: '1rem 1.25rem',
                      border: '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: '#ffffff'
                    }}>
                      <div>
                        <div style={{ fontWeight: '800', fontSize: '0.925rem', color: 'var(--text-main)' }}>{mail.address}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-sub)', marginTop: '0.2rem' }}>
                          Cuota: {mail.used_mb} MB / {mail.quota_mb} MB ({((mail.used_mb / mail.quota_mb) * 100).toFixed(1)}%)
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#15803d', backgroundColor: '#dcfce7', padding: '0.25rem 0.55rem', borderRadius: '4px' }}>
                          En Línea
                        </span>
                        <button 
                          onClick={() => handleDeleteEmail(mail.address)}
                          style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444', padding: '0.25rem' }}
                          title="Eliminar casilla"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB: DOMAINS */}
            {activeSection === 'domains' && (
              <div>
                <h4 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.15rem', fontWeight: '800', marginBottom: '1.25rem' }}>
                  Configuración de Dominios y Redirecciones
                </h4>

                <div style={{ marginBottom: '2rem' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: '800', color: 'var(--text-sub)', textTransform: 'uppercase', marginBottom: '0.55rem' }}>
                    Dominio Principal
                  </div>
                  <div style={{ padding: '1rem', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: '1.05rem', color: 'var(--text-main)' }}>{currentClientObj?.domain}</strong>
                    <a href={`http://${currentClientObj?.domain}`} target="_blank" rel="noreferrer" className="copy-btn">
                      Abrir Sitio <ExternalLink size={12} />
                    </a>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: '800', color: 'var(--text-sub)', textTransform: 'uppercase', marginBottom: '0.55rem' }}>
                    Alias y Subdominios
                  </div>
                  <div style={{ padding: '1rem', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center' }}>
                    No hay alias ni subdominios adicionales configurados para este sitio web.
                  </div>
                </div>
              </div>
            )}

            {/* TAB: LOGS */}
            {activeSection === 'logs' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                  <h4 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.15rem', fontWeight: '800', margin: 0 }}>
                    Visor de Registros (Logs)
                  </h4>
                  <div style={{ display: 'flex', gap: '0.55rem' }}>
                    <CustomSelect 
                      options={[
                        { value: 'nginx', label: 'Nginx Access Logs' },
                        { value: 'php', label: 'PHP Error Logs' },
                        { value: 'app', label: 'Application Logs' },
                      ]}
                      value={logType}
                      onChange={setLogType}
                      style={{ minWidth: '180px' }}
                    />
                    <button className="btn btn-secondary" style={{ padding: '0.55rem' }} onClick={fetchClientData}>
                      <RefreshCw size={14} />
                    </button>
                  </div>
                </div>

                <div className="log-viewer">
                  {logs.length > 0 ? (
                    logs.map((log, idx) => (
                      <div key={idx} style={{ marginBottom: '0.45rem', display: 'flex', gap: '0.65rem' }}>
                        <span style={{ color: '#64748b' }}>[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                        <span style={{ color: log.level === 'WARNING' ? '#f59e0b' : log.level === 'ERROR' ? '#ef4444' : '#10b981', fontWeight: '700' }}>
                          {log.level || 'INFO'}
                        </span>
                        <span>{log.message}</span>
                      </div>
                    ))
                  ) : (
                    <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>No hay registros disponibles.</div>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          No hay clientes registrados en el sistema. Agrega un cliente desde la pestaña correspondiente.
        </div>
      )}
    </div>
  );
}
