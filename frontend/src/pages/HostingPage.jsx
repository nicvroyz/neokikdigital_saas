import React, { useState } from 'react';
import { Server, HardDrive, ShieldCheck, Terminal, RefreshCw, Code, CheckCircle, Zap } from 'lucide-react';

export default function HostingPage({ clients, onSyncCaddy }) {
  const [selectedDomainForConfig, setSelectedDomainForConfig] = useState(null);
  const [terminalOutput, setTerminalOutput] = useState('');
  const [isRunningCommand, setIsRunningCommand] = useState(false);

  const activeCount = clients.filter(c => c.status === 'ACTIVE').length;
  const suspendedCount = clients.filter(c => c.status === 'SUSPENDED').length;

  const handleTestCaddy = () => {
    setIsRunningCommand(true);
    setTerminalOutput('Ejecutando: docker exec neokik-caddy caddy validate --config /etc/caddy/Caddyfile ...');
    setTimeout(() => {
      setTerminalOutput(
        'Ejecutando: docker exec neokik-caddy caddy validate --config /etc/caddy/Caddyfile ...\n' +
        'info: Caddyfile is valid\n' +
        'success: Caddy configuration validation successful'
      );
      setIsRunningCommand(false);
    }, 800);
  };

  const handleReloadCaddy = () => {
    setIsRunningCommand(true);
    setTerminalOutput('Ejecutando: docker exec neokik-caddy caddy reload --config /etc/caddy/Caddyfile ...');
    setTimeout(() => {
      setTerminalOutput(
        'Ejecutando: docker exec neokik-caddy caddy reload --config /etc/caddy/Caddyfile ...\n' +
        'success: Caddy service reloaded successfully. Routing rules updated in zero milliseconds.'
      );
      setIsRunningCommand(false);
      onSyncCaddy();
    }, 1000);
  };

  const generateConfigPreview = (client) => {
    if (client.status === 'SUSPENDED') {
      return `# Configuración de Servidor Caddy [SUSPENDIDO]
# Ruta: /etc/caddy/conf.d/${client.domain}.caddy

${client.domain}, www.${client.domain} {
    # Enrutamiento a pantalla de suspensión
    root * /var/www/neokik
    file_server
    try_files /suspended.html =503
}`;
    }

    return `# Configuración de Servidor Caddy [ACTIVO]
# Ruta: /etc/caddy/conf.d/${client.domain}.caddy

${client.domain}, www.${client.domain} {
    # Mapeo de puerto al contenedor Docker del cliente
    reverse_proxy ${client.domain}:80
}`;
  };

  return (
    <div>
      {/* Page Title & Quick Actions */}
      <div className="top-header">
        <div className="page-title">
          <h1>Servidor VPS y Núcleo Proxy Caddy</h1>
          <p>Estado del servidor Ubuntu, tablas de enrutamiento Caddy, certificados SSL automáticos y proxy inverso Docker</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn btn-secondary" onClick={handleTestCaddy} disabled={isRunningCommand}>
            <CheckCircle size={16} color="#059669" /> Validar Configuración Caddy
          </button>
          <button className="btn btn-primary" onClick={handleReloadCaddy} disabled={isRunningCommand}>
            <RefreshCw size={16} /> Recargar Proxy Caddy
          </button>
        </div>
      </div>

      {/* VPS Hardware & Server Health Overview */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.825rem', fontWeight: '700', color: 'var(--text-sub)' }}>SO y Servidor</span>
            <Server size={18} color="var(--brand-indigo)" />
          </div>
          <div style={{ fontSize: '1.2rem', fontWeight: '800', fontFamily: 'Outfit, sans-serif' }}>Ubuntu 22.04 LTS</div>
          <div style={{ fontSize: '0.78rem', color: '#059669', fontWeight: '700', marginTop: '0.2rem' }}>● Servidor En Línea (vps-neokik-01)</div>
        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.825rem', fontWeight: '700', color: 'var(--text-sub)' }}>Servicio Caddy</span>
            <Zap size={18} color="#0284c7" />
          </div>
          <div style={{ fontSize: '1.2rem', fontWeight: '800', fontFamily: 'Outfit, sans-serif' }}>Docker Proxy Inverso</div>
          <div style={{ fontSize: '0.78rem', color: '#059669', fontWeight: '700', marginTop: '0.2rem' }}>● neokik-caddy activo (ejecutándose)</div>
        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.825rem', fontWeight: '700', color: 'var(--text-sub)' }}>Rutas Caddy</span>
            <Code size={18} color="#7c3aed" />
          </div>
          <div style={{ fontSize: '1.2rem', fontWeight: '800', fontFamily: 'Outfit, sans-serif' }}>{clients.length} Configurados</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-sub)', fontWeight: '600', marginTop: '0.2rem' }}>{activeCount} En Línea | {suspendedCount} Bloqueados</div>
        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.825rem', fontWeight: '700', color: 'var(--text-sub)' }}>Almacenamiento /var/www</span>
            <HardDrive size={18} color="#d97706" />
          </div>
          <div style={{ fontSize: '1.2rem', fontWeight: '800', fontFamily: 'Outfit, sans-serif' }}>14.8 GB / 80 GB</div>
          <div style={{ fontSize: '0.78rem', color: '#059669', fontWeight: '700', marginTop: '0.2rem' }}>18.5% Uso de Disco</div>
        </div>
      </div>

      {/* Terminal Output Console */}
      {terminalOutput && (
        <div className="card" style={{ backgroundColor: '#0f172a', color: '#38bdf8', padding: '1.25rem', marginBottom: '2rem', fontFamily: 'monospace', fontSize: '0.875rem', borderRadius: 'var(--radius-lg)' }}>
          <div style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Terminal size={14} /> Consola CLI del Servidor VPS
          </div>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{terminalOutput}</pre>
        </div>
      )}

      {/* Live Caddy Routing Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '2rem' }}>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-default)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.25rem', fontWeight: '800' }}>Tabla de Enrutamiento Caddy</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-sub)' }}>Mapeo de dominios vinculado a /etc/caddy/conf.d</p>
          </div>
          <button className="btn btn-secondary" onClick={onSyncCaddy} style={{ fontSize: '0.825rem', padding: '0.45rem 0.85rem' }}>
            Reconstruir Reglas Caddy
          </button>
        </div>

        <div className="table-wrapper" style={{ border: 'none', borderRadius: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Dominio del Cliente</th>
                <th>Ruta de Destino</th>
                <th>Certificado SSL</th>
                <th>Estado de Enrutamiento</th>
                <th style={{ textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {clients.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    No hay dominios configurados actualmente.
                  </td>
                </tr>
              ) : (
                clients.map((client) => (
                  <tr key={client.id}>
                    <td>
                      <div style={{ fontWeight: '800', color: 'var(--text-main)', fontSize: '0.95rem' }}>{client.domain}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-sub)' }}>Conf: /etc/caddy/conf.d/{client.domain}.caddy</div>
                    </td>
                    <td>
                      {client.status === 'SUSPENDED' ? (
                        <div>
                          <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#be123c' }}>
                            /var/www/neokik/suspended.html
                          </span>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>HTTP 503 Modo Suspensión</div>
                        </div>
                      ) : (
                        <div>
                          <span style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-main)' }}>
                            {client.domain}:80
                          </span>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Proxy Inverso de Caddy</div>
                        </div>
                      )}
                    </td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', backgroundColor: '#ecfdf5', color: '#15803d', border: '1px solid #bbf7d0', padding: '0.25rem 0.65rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: '800' }}>
                        <ShieldCheck size={13} /> SSL Automático Caddy
                      </span>
                    </td>
                    <td>
                      {client.status === 'SUSPENDED' ? (
                        <span className="badge badge-suspended"><span className="pulse-dot"></span> Ruta Suspendida</span>
                      ) : (
                        <span className="badge badge-active"><span className="pulse-dot"></span> Proxy Activo</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}
                        onClick={() => setSelectedDomainForConfig(client)}
                      >
                        <Code size={14} /> Ver Código Caddy
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Caddy Code Inspector Modal */}
      {selectedDomainForConfig && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '680px' }}>
            <div className="modal-header">
              <h2>Configuración Caddy: {selectedDomainForConfig.domain}</h2>
              <button className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem' }} onClick={() => setSelectedDomainForConfig(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ backgroundColor: '#0f172a', padding: '1.25rem' }}>
              <pre style={{ color: '#38bdf8', fontFamily: 'monospace', fontSize: '0.85rem', margin: 0, overflowX: 'auto' }}>
                {generateConfigPreview(selectedDomainForConfig)}
              </pre>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setSelectedDomainForConfig(null)}>Cerrar Inspector</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
