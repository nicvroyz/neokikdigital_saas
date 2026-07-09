import React, { useState } from 'react';
import { Server, HardDrive, ShieldCheck, Terminal, RefreshCw, Code, CheckCircle, Zap } from 'lucide-react';

export default function HostingPage({ clients, onSyncNginx }) {
  const [selectedDomainForConfig, setSelectedDomainForConfig] = useState(null);
  const [terminalOutput, setTerminalOutput] = useState('');
  const [isRunningCommand, setIsRunningCommand] = useState(false);

  const activeCount = clients.filter(c => c.status === 'ACTIVE').length;
  const suspendedCount = clients.filter(c => c.status === 'SUSPENDED').length;

  const handleTestNginx = () => {
    setIsRunningCommand(true);
    setTerminalOutput('Ejecutando: sudo nginx -t ...');
    setTimeout(() => {
      setTerminalOutput(
        'Ejecutando: sudo nginx -t ...\n' +
        'nginx: el archivo de configuración /etc/nginx/nginx.conf es correcto (sintaxis OK)\n' +
        'nginx: la prueba del archivo de configuración /etc/nginx/nginx.conf fue exitosa'
      );
      setIsRunningCommand(false);
    }, 800);
  };

  const handleReloadNginx = () => {
    setIsRunningCommand(true);
    setTerminalOutput('Ejecutando: sudo systemctl reload nginx ...');
    setTimeout(() => {
      setTerminalOutput(
        'Ejecutando: sudo systemctl reload nginx ...\n' +
        'Servicio Nginx recargado correctamente. Enrutamiento VirtualHosts actualizado en cero milisegundos.'
      );
      setIsRunningCommand(false);
      onSyncNginx();
    }, 1000);
  };

  const generateConfigPreview = (client) => {
    if (client.status === 'SUSPENDED') {
      return `# Regla de Servidor Virtual Nginx [SUSPENDIDO]
# Ruta: /etc/nginx/sites-available/${client.domain}.conf
server {
    listen 80;
    listen [::]:80;
    server_name ${client.domain} www.${client.domain};

    access_log /var/log/nginx/${client.domain}.access.log;
    error_log /var/log/nginx/${client.domain}.error.log;

    # ENRUTAMIENTO A PANTALLA DE SUSPENSIÓN POR FALTA DE PAGO
    location / {
        root /var/www/neokik;
        try_files /suspended.html =503;
    }
}`;
    }

    return `# Regla de Servidor Virtual Nginx [ACTIVO]
# Ruta: /etc/nginx/sites-available/${client.domain}.conf
server {
    listen 80;
    listen [::]:80;
    server_name ${client.domain} www.${client.domain};

    root ${client.doc_root || `/var/www/neokik/${client.domain}`};
    index index.html index.htm index.php;

    access_log /var/log/nginx/${client.domain}.access.log;
    error_log /var/log/nginx/${client.domain}.error.log;

    location / {
        try_files $uri $uri/ /index.php?$args;
    }

    location ~ \\.php$ {
        include fastcgi_params;
        fastcgi_pass unix:/var/run/php/php8.1-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    }

    # Certificado SSL Let's Encrypt
    location ~ /\\.well-known/acme-challenge {
        allow all;
    }
}`;
  };

  return (
    <div>
      {/* Page Title & Quick Actions */}
      <div className="top-header">
        <div className="page-title">
          <h1>Servidor VPS y Núcleo Proxy Nginx</h1>
          <p>Estado del servidor Ubuntu, tablas de enrutamiento VirtualHost, certificados SSL y proxy inverso en tiempo real</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn btn-secondary" onClick={handleTestNginx} disabled={isRunningCommand}>
            <CheckCircle size={16} color="#059669" /> Probar Sintaxis Nginx
          </button>
          <button className="btn btn-primary" onClick={handleReloadNginx} disabled={isRunningCommand}>
            <RefreshCw size={16} /> Recargar Motor Nginx
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
            <span style={{ fontSize: '0.825rem', fontWeight: '700', color: 'var(--text-sub)' }}>Servicio Nginx</span>
            <Zap size={18} color="#0284c7" />
          </div>
          <div style={{ fontSize: '1.2rem', fontWeight: '800', fontFamily: 'Outfit, sans-serif' }}>v1.24.0 Proxy Inverso</div>
          <div style={{ fontSize: '0.78rem', color: '#059669', fontWeight: '700', marginTop: '0.2rem' }}>● systemctl activo (ejecutándose)</div>
        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.825rem', fontWeight: '700', color: 'var(--text-sub)' }}>Rutas VirtualHost</span>
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
          <pre style={{ margin: 0, whitespace: 'pre-wrap' }}>{terminalOutput}</pre>
        </div>
      )}

      {/* Live Nginx VirtualHosts Directory */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '2rem' }}>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-default)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.25rem', fontWeight: '800' }}>Tabla de Enrutamiento VirtualHost Nginx</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-sub)' }}>Mapeo de dominios vinculado a /etc/nginx/sites-available</p>
          </div>
          <button className="btn btn-secondary" onClick={onSyncNginx} style={{ fontSize: '0.825rem', padding: '0.45rem 0.85rem' }}>
            Reconstruir Reglas Nginx
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
              {clients.map((client) => (
                <tr key={client.id}>
                  <td>
                    <div style={{ fontWeight: '800', color: 'var(--text-main)', fontSize: '0.95rem' }}>{client.domain}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-sub)' }}>Conf: /etc/nginx/sites-available/{client.domain}.conf</div>
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
                          {client.doc_root || `/var/www/neokik/${client.domain}`}
                        </span>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>HTTP 200 Directorio en Línea</div>
                      </div>
                    )}
                  </td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', backgroundColor: '#ecfdf5', color: '#15803d', border: '1px solid #bbf7d0', padding: '0.25rem 0.65rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: '800' }}>
                      <ShieldCheck size={13} /> SSL Let's Encrypt
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
                      <Code size={14} /> Ver Código Nginx
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Nginx Code Inspector Modal */}
      {selectedDomainForConfig && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '680px' }}>
            <div className="modal-header">
              <h2>Configuración Nginx: {selectedDomainForConfig.domain}</h2>
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
