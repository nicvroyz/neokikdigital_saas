import React, { useState } from 'react';
import { Settings, Mail, Bell, Shield, Database, Save, CheckCircle, RefreshCw, Send, DollarSign, Globe } from 'lucide-react';
import CustomSelect from '../components/CustomSelect';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('general');
  const [saveStatus, setSaveStatus] = useState(false);

  // General Settings State
  const [generalConfig, setGeneralConfig] = useState({
    agency_name: 'Neokik Digital',
    contact_email: 'contacto@neokikdigital.com',
    currency: 'CLP',
    language: 'es',
    grace_period_default: 5,
  });

  // SMTP Mailer Settings State
  const [smtpConfig, setSmtpConfig] = useState({
    smtp_host: 'smtp.gmail.com',
    smtp_port: 587,
    smtp_user: 'avisos@neokikdigital.com',
    smtp_pass: '••••••••••••••••',
    from_name: 'Cobranzas Neokik Digital',
    test_recipient: 'admin@neokikdigital.com',
  });

  const [testEmailSending, setTestEmailSending] = useState(false);
  const [testEmailResult, setTestEmailResult] = useState(null);

  const handleSaveGeneral = (e) => {
    e.preventDefault();
    setSaveStatus(true);
    setTimeout(() => setSaveStatus(false), 2500);
  };

  const handleSaveSmtp = (e) => {
    e.preventDefault();
    setSaveStatus(true);
    setTimeout(() => setSaveStatus(false), 2500);
  };

  const handleSendTestEmail = async () => {
    setTestEmailSending(true);
    setTestEmailResult(null);
    try {
      const token = localStorage.getItem('neokik_token');
      const res = await fetch('/api/hosting/test-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ recipient_email: smtpConfig.test_recipient }),
      });
      const data = await res.json();
      setTestEmailResult({
        success: res.ok,
        message: data.message || data.error || 'Resultado del test enviado',
      });
    } catch (err) {
      setTestEmailResult({ success: false, message: 'Fallo al conectar con el servidor backend SMTP' });
    } finally {
      setTestEmailSending(false);
    }
  };

  const currencyOptions = [
    { value: 'CLP', label: '$ CLP (Peso Chileno)' },
    { value: 'USD', label: '$ USD (Dólar estadounidense)' },
    { value: 'EUR', label: '€ EUR (Euro)' },
  ];

  const languageOptions = [
    { value: 'es', label: 'Español (Chile)' },
    { value: 'en', label: 'English (US)' },
  ];

  return (
    <div>
      {/* Top Header */}
      <div className="top-header">
        <div className="page-title">
          <h1>Configuración del Sistema Neokik SaaS</h1>
          <p>Ajustes generales de agencia, servidor de correo SMTP para avisos automáticos e integración con base de datos</p>
        </div>
      </div>

      {saveStatus && (
        <div style={{ backgroundColor: '#dcfce7', border: '1px solid #bbf7d0', color: '#15803d', padding: '0.85rem 1.25rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.55rem', fontWeight: '700', animation: 'modalPop 0.2s ease' }}>
          <CheckCircle size={18} /> ¡Configuración guardada exitosamente en el servidor!
        </div>
      )}

      {/* Settings Navigation Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem', borderBottom: '1px solid var(--border-default)', paddingBottom: '0.75rem' }}>
        {[
          { id: 'general', label: 'General y Moneda ($ CLP)', icon: Settings },
          { id: 'smtp', label: 'Servidor de Correo SMTP', icon: Mail },
          { id: 'notifications', label: 'Reglas de Cobranza Cron', icon: Bell },
          { id: 'audit', label: 'Logs del Sistema', icon: Shield },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              className={`btn ${activeTab === tab.id ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '0.65rem 1.15rem', fontSize: '0.85rem' }}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={16} /> {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: GENERAL & CURRENCY */}
      {activeTab === 'general' && (
        <div className="card" style={{ maxWidth: '750px' }}>
          <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.35rem', fontWeight: '800', marginBottom: '1.5rem' }}>
            Ajustes Generales de la Agencia
          </h3>

          <form onSubmit={handleSaveGeneral}>
            <div className="form-group">
              <label className="form-label">Nombre Comercial de la Agencia *</label>
              <input
                type="text"
                className="form-input"
                required
                value={generalConfig.agency_name}
                onChange={(e) => setGeneralConfig({ ...generalConfig, agency_name: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Correo Principal de Notificaciones *</label>
              <input
                type="email"
                className="form-input"
                required
                value={generalConfig.contact_email}
                onChange={(e) => setGeneralConfig({ ...generalConfig, contact_email: e.target.value })}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Moneda Predeterminada *</label>
                <CustomSelect
                  options={currencyOptions}
                  value={generalConfig.currency}
                  onChange={(val) => setGeneralConfig({ ...generalConfig, currency: val.target.value })}
                  icon={DollarSign}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Idioma de la Interfaz</label>
                <CustomSelect
                  options={languageOptions}
                  value={generalConfig.language}
                  onChange={(val) => setGeneralConfig({ ...generalConfig, language: val.target.value })}
                  icon={Globe}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Días de Período de Gracia por Defecto</label>
              <input
                type="number"
                className="form-input"
                value={generalConfig.grace_period_default}
                onChange={(e) => setGeneralConfig({ ...generalConfig, grace_period_default: parseInt(e.target.value) })}
              />
              <span style={{ fontSize: '0.78rem', color: 'var(--text-sub)', marginTop: '0.25rem', display: 'block' }}>
                Número de días posteriores al vencimiento antes de redirigir a <code>suspended.html</code>.
              </span>
            </div>

            <div style={{ marginTop: '2rem' }}>
              <button type="submit" className="btn btn-primary">
                <Save size={16} /> Guardar Cambios Generales
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 2: SMTP MAILER CONFIG */}
      {activeTab === 'smtp' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '1.75rem' }}>
          <div className="card">
            <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.35rem', fontWeight: '800', marginBottom: '1.5rem' }}>
              Servidor SMTP de Envíos Automáticos
            </h3>

            <form onSubmit={handleSaveSmtp}>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Servidor SMTP Host *</label>
                  <input
                    type="text"
                    className="form-input"
                    required
                    value={smtpConfig.smtp_host}
                    onChange={(e) => setSmtpConfig({ ...smtpConfig, smtp_host: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Puerto SMTP *</label>
                  <input
                    type="number"
                    className="form-input"
                    required
                    value={smtpConfig.smtp_port}
                    onChange={(e) => setSmtpConfig({ ...smtpConfig, smtp_port: parseInt(e.target.value) })}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Usuario SMTP / Email *</label>
                  <input
                    type="text"
                    className="form-input"
                    required
                    value={smtpConfig.smtp_user}
                    onChange={(e) => setSmtpConfig({ ...smtpConfig, smtp_user: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Contraseña de Aplicación SMTP *</label>
                  <input
                    type="password"
                    className="form-input"
                    required
                    value={smtpConfig.smtp_pass}
                    onChange={(e) => setSmtpConfig({ ...smtpConfig, smtp_pass: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Nombre del Remitente en Correos *</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  value={smtpConfig.from_name}
                  onChange={(e) => setSmtpConfig({ ...smtpConfig, from_name: e.target.value })}
                />
              </div>

              <div style={{ marginTop: '1.75rem' }}>
                <button type="submit" className="btn btn-primary">
                  <Save size={16} /> Guardar Parámetros SMTP
                </button>
              </div>
            </form>
          </div>

          <div>
            <div className="card">
              <h4 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.1rem', fontWeight: '800', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <Send size={18} color="var(--brand-indigo)" /> Probar Envío de Correo SMTP
              </h4>

              <div className="form-group">
                <label className="form-label">Enviar Correo de Prueba a:</label>
                <input
                  type="email"
                  className="form-input"
                  value={smtpConfig.test_recipient}
                  onChange={(e) => setSmtpConfig({ ...smtpConfig, test_recipient: e.target.value })}
                />
              </div>

              <button
                type="button"
                className="btn btn-secondary"
                style={{ width: '100%' }}
                onClick={handleSendTestEmail}
                disabled={testEmailSending}
              >
                {testEmailSending ? (
                  <>
                    <RefreshCw size={16} className="spin" style={{ animation: 'spin 1s linear infinite' }} /> Enviando Prueba...
                  </>
                ) : (
                  <>
                    <Send size={16} /> Enviar Mensaje de Prueba
                  </>
                )}
              </button>

              {testEmailResult && (
                <div style={{
                  marginTop: '1.25rem',
                  padding: '0.85rem 1rem',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: testEmailResult.success ? '#dcfce7' : '#ffe4e6',
                  color: testEmailResult.success ? '#15803d' : '#be123c',
                  fontSize: '0.85rem',
                  fontWeight: '700'
                }}>
                  {testEmailResult.message}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: CRON RULES */}
      {activeTab === 'notifications' && (
        <div className="card" style={{ maxWidth: '800px' }}>
          <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.35rem', fontWeight: '800', marginBottom: '1.25rem' }}>
            Reglas de Automatización del Cron Diario
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ padding: '1.15rem 1.35rem', backgroundColor: '#f8fafc', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: '800', fontSize: '0.95rem' }}>1. Aviso Previo de Vencimiento</div>
                <div style={{ fontSize: '0.825rem', color: 'var(--text-sub)' }}>Se envía correo 7 días antes de la fecha de vencimiento.</div>
              </div>
              <span className="badge badge-active">ACTIVO</span>
            </div>

            <div style={{ padding: '1.15rem 1.35rem', backgroundColor: '#f8fafc', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: '800', fontSize: '0.95rem' }}>2. Entrada en Período de Gracia</div>
                <div style={{ fontSize: '0.825rem', color: 'var(--text-sub)' }}>Al cumplir la fecha sin pago, pasa a EXPIRED y avisa por correo.</div>
              </div>
              <span className="badge badge-active">ACTIVO</span>
            </div>

            <div style={{ padding: '1.15rem 1.35rem', backgroundColor: '#f8fafc', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: '800', fontSize: '0.95rem' }}>3. Suspensión Automática de Nginx</div>
                <div style={{ fontSize: '0.825rem', color: 'var(--text-sub)' }}>Al agotar los 5 días de gracia, cambia a SUSPENDED y activa el proxy 503.</div>
              </div>
              <span className="badge badge-active">ACTIVO</span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: AUDIT LOGS */}
      {activeTab === 'audit' && (
        <div className="card">
          <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.35rem', fontWeight: '800', marginBottom: '1.25rem' }}>
            Registro del Sistema de Auditoría
          </h3>

          <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', backgroundColor: '#0f172a', color: '#38bdf8', padding: '1.25rem', borderRadius: 'var(--radius-md)', height: '280px', overflowY: 'auto' }}>
            <div>[CRON AUDIT 00:00:00] Initialized subscription status check.</div>
            <div>[CRON AUDIT] Papeles Concepción (ID: cli-1) Status: ACTIVE (Valid until 2026-07-18).</div>
            <div>[CRON AUDIT] Rabbo Restaurant (ID: cli-2) Status: ACTIVE (Valid until 2026-08-01).</div>
            <div>[CRON AUDIT] Boutique Imprenta (ID: cli-3) Expiration passed (2026-06-30). Grace period active.</div>
            <div>[SMTP DISPATCH] Sent warning email to ventas@boutiqueimprenta.cl</div>
            <div>[NGINX PROXY ENGINE] VirtualHosts verified in /etc/nginx/sites-available/</div>
            <div>[OK] All services running synchronously.</div>
          </div>
        </div>
      )}
    </div>
  );
}
