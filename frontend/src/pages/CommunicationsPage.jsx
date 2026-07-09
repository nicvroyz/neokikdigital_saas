import React, { useState, useEffect } from 'react';
import { Send, Mail, MessageSquare, Users, QrCode, ShieldCheck, CheckCircle2, AlertTriangle, RefreshCw, Layers, Eye, Check, Clock, Play } from 'lucide-react';
import CustomSelect from '../components/CustomSelect';

export default function CommunicationsPage({ clients, token }) {
  const [activeTab, setActiveTab] = useState('create');
  const [campaigns, setCampaigns] = useState([]);
  const [whatsappStatus, setWhatsappStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Form State
  const [campaignForm, setCampaignForm] = useState({
    title: '',
    message: '',
    channel: 'BOTH',
    target_audience: 'ALL_CLIENTS',
  });

  const fetchCommunicationsData = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [cRes, wRes] = await Promise.all([
        fetch('/api/communications/campaigns', { headers }),
        fetch('/api/communications/whatsapp/status', { headers }),
      ]);

      if (cRes.ok) setCampaigns(await cRes.json());
      if (wRes.ok) setWhatsappStatus(await wRes.json());
    } catch (err) {
      console.error('Error fetching communications data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCommunicationsData();
  }, [token]);

  const handleCreateAndSendCampaign = async () => {
    setIsSending(true);
    setShowConfirmModal(false);

    try {
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
      const createRes = await fetch('/api/communications/campaigns', {
        method: 'POST',
        headers,
        body: JSON.stringify(campaignForm),
      });

      if (!createRes.ok) throw new Error('Error al crear campaña');
      const createdCampaign = await createRes.json();

      const sendRes = await fetch(`/api/communications/campaigns/${createdCampaign.id}/send`, {
        method: 'POST',
        headers,
      });

      if (sendRes.ok) {
        setCampaignForm({
          title: '',
          message: '',
          channel: 'BOTH',
          target_audience: 'ALL_CLIENTS',
        });
        setActiveTab('history');
        fetchCommunicationsData();
      }
    } catch (err) {
      console.error('Error sending campaign:', err);
      alert('Error en el despacho masivo');
    } finally {
      setIsSending(false);
    }
  };

  const channelOptions = [
    { value: 'BOTH', label: 'Ambos Canales (Correo SMTP + WhatsApp Web)' },
    { value: 'EMAIL', label: 'Solo Correo Electrónico (SMTP)' },
    { value: 'WHATSAPP', label: 'Solo WhatsApp Web (Baileys VPS)' },
  ];

  const audienceOptions = [
    { value: 'ALL_CLIENTS', label: 'Todos los Clientes Registrados (100%)' },
    { value: 'ACTIVE_CLIENTS', label: 'Únicamente Clientes Activos' },
  ];

  const getTargetAudienceLabel = (target) => {
    switch (target) {
      case 'ALL_CLIENTS':
        return 'Todos los Clientes (100%)';
      case 'ACTIVE_CLIENTS':
        return 'Solo Clientes Activos';
      default:
        return 'Clientes Seleccionados';
    }
  };

  return (
    <div>
      {/* Top Title */}
      <div className="top-header">
        <div className="page-title">
          <h1>Módulo de Comunicaciones Masivas</h1>
          <p>Envío masivo de avisos, cobranzas y novedades vía Correo SMTP y WhatsApp Web (Baileys VPS sin costo)</p>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem', borderBottom: '1px solid var(--border-default)', paddingBottom: '0.75rem' }}>
        {[
          { id: 'create', label: 'Crear Nueva Campaña', icon: Send },
          { id: 'history', label: 'Historial y Seguimiento de Entregas', icon: Layers },
          { id: 'whatsapp', label: 'Estado de WhatsApp Web (QR Baileys)', icon: QrCode },
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

      {/* TAB 1: CREAR NUEVA CAMPAÑA */}
      {activeTab === 'create' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '1.75rem' }}>
          <div className="card">
            <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.35rem', fontWeight: '800', marginBottom: '1.5rem' }}>
              Configurar Despacho Masivo
            </h3>

            <form onSubmit={(e) => { e.preventDefault(); setShowConfirmModal(true); }}>
              <div className="form-group">
                <label className="form-label">Título o Asunto de la Campaña *</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  placeholder="Ej. Aviso Importante: Mantenimiento Programado Servidor VPS"
                  value={campaignForm.title}
                  onChange={(e) => setCampaignForm({ ...campaignForm, title: e.target.value })}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Canal de Enrutamiento *</label>
                  <CustomSelect
                    options={channelOptions}
                    value={campaignForm.channel}
                    onChange={(val) => setCampaignForm({ ...campaignForm, channel: val.target.value })}
                    icon={Send}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Audiencia Destino *</label>
                  <CustomSelect
                    options={audienceOptions}
                    value={campaignForm.target_audience}
                    onChange={(val) => setCampaignForm({ ...campaignForm, target_audience: val.target.value })}
                    icon={Users}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Mensaje Informativo *</label>
                <textarea
                  className="form-textarea"
                  rows={6}
                  required
                  placeholder="Estimado cliente {{client_name}}, queremos informarle que..."
                  value={campaignForm.message}
                  onChange={(e) => setCampaignForm({ ...campaignForm, message: e.target.value })}
                />
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.35rem', display: 'block' }}>
                  Puedes usar la variable <code>{'{{client_name}}'}</code> para personalizar automáticamente el nombre de cada cliente.
                </span>
              </div>

              <div style={{ marginTop: '1.75rem' }}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ padding: '0.85rem 1.75rem' }}
                  disabled={isSending || !campaignForm.title || !campaignForm.message}
                >
                  {isSending ? (
                    <>
                      <RefreshCw size={18} className="spin" style={{ animation: 'spin 1s linear infinite' }} /> Despachando Mensajes...
                    </>
                  ) : (
                    <>
                      <Send size={18} /> Revisar y Despachar Campaña
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          <div>
            <div className="card" style={{ backgroundColor: '#ffffff', border: '1px solid var(--border-default)', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', fontWeight: '800', color: 'var(--brand-indigo)', textTransform: 'uppercase', marginBottom: '1rem' }}>
                <Eye size={16} /> Vista Previa del Mensaje (WhatsApp)
              </div>

              <div style={{ backgroundColor: '#efeae2', borderRadius: 'var(--radius-md)', padding: '1rem', border: '1px solid #d1d7db' }}>
                <div style={{ backgroundColor: '#ffffff', padding: '0.85rem 1rem', borderRadius: '8px', boxShadow: '0 1px 2px rgba(0,0,0,0.1)', fontSize: '0.875rem', color: '#111b21', whiteSpace: 'pre-wrap' }}>
                  <div style={{ fontWeight: '800', color: '#128c7e', marginBottom: '0.35rem' }}>
                    📢 {campaignForm.title || 'Asunto de la Campaña'}
                  </div>
                  {campaignForm.message ? campaignForm.message.replace(/{{client_name}}/g, 'Papeles Concepción') : 'Tu mensaje aparecerá redactado aquí en tiempo real...'}
                  <div style={{ fontSize: '0.7rem', color: '#667781', textAlign: 'right', marginTop: '0.5rem' }}>
                    {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ✓✓
                  </div>
                </div>
              </div>
            </div>

            <div className="card" style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: '800', color: '#1d4ed8', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <ShieldCheck size={16} /> Envio Seguro y Gratuito en VPS
              </div>
              <p style={{ fontSize: '0.8rem', color: '#1e40af', lineHeight: 1.5 }}>
                El motor Baileys ejecuta un retraso de seguridad de 2.0 segundos entre cada mensaje masivo para cumplir con las políticas anti-spam y proteger tu número telefónico.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: HISTORIAL Y SEGUIMIENTO */}
      {activeTab === 'history' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-default)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.25rem', fontWeight: '800' }}>Historial de Campañas y Métricas de Entrega</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-sub)' }}>Registro trazable de mensajes despachados por cliente y canal</p>
            </div>
            <button className="btn btn-secondary" onClick={fetchCommunicationsData} style={{ fontSize: '0.825rem', padding: '0.45rem 0.85rem' }}>
              <RefreshCw size={14} /> Actualizar Historial
            </button>
          </div>

          <div className="table-wrapper" style={{ border: 'none', borderRadius: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Fecha de Envío</th>
                  <th>Título / Asunto de la Campaña</th>
                  <th>Canal Utilizado</th>
                  <th>Audiencia</th>
                  <th>Estado de Despacho</th>
                  <th>Métricas Entregadas</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((camp) => (
                  <tr key={camp.id}>
                    <td style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-sub)' }}>
                      {new Date(camp.created_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td>
                      <div style={{ fontWeight: '800', color: 'var(--text-main)', fontSize: '0.95rem' }}>{camp.title}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{camp.message.slice(0, 50)}...</div>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.78rem', fontWeight: '800', padding: '0.25rem 0.65rem', borderRadius: '9999px', backgroundColor: '#e0e7ff', color: '#3730a3' }}>
                        {camp.channel === 'BOTH' ? 'Email + WhatsApp' : camp.channel}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.85rem', fontWeight: '600' }}>{getTargetAudienceLabel(camp.target_audience)}</td>
                    <td>
                      <span style={{
                        fontSize: '0.75rem',
                        fontWeight: '800',
                        padding: '0.25rem 0.65rem',
                        borderRadius: '9999px',
                        backgroundColor: camp.status === 'SENT' ? '#dcfce7' : '#fef3c7',
                        color: camp.status === 'SENT' ? '#15803d' : '#b45309'
                      }}>
                        {camp.status === 'SENT' ? '● DESPACHADO' : camp.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: '800', color: '#15803d', fontSize: '0.875rem' }}>
                        ✓ {camp.sent_count || camp.total_recipients || 0} Exitosos
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: ESTADO DE WHATSAPP WEB */}
      {activeTab === 'whatsapp' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '1.25rem' }}>
              <div style={{ width: '42px', height: '42px', borderRadius: 'var(--radius-md)', backgroundColor: '#dcfce7', color: '#15803d', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <MessageSquare size={22} />
              </div>
              <div>
                <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.25rem', fontWeight: '800' }}>
                  Estado de la Sesión WhatsApp Web
                </h3>
                <p style={{ fontSize: '0.825rem', color: 'var(--text-sub)' }}>Conexión persistente almacenada en el servidor VPS Ubuntu</p>
              </div>
            </div>

            <div style={{ backgroundColor: '#f8fafc', padding: '1.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.875rem', fontWeight: '700', color: 'var(--text-sub)' }}>Estado de Conexión</span>
                <span className="badge badge-active"><span className="pulse-dot"></span> CONECTADO EN VIVO</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.875rem', fontWeight: '700', color: 'var(--text-sub)' }}>Número Vinculado</span>
                <span style={{ fontWeight: '800', color: 'var(--brand-indigo)', fontSize: '0.95rem' }}>{whatsappStatus?.phoneNumber || '+56 9 8765 4321'}</span>
              </div>
            </div>

            <div style={{ fontSize: '0.85rem', color: 'var(--text-sub)', lineHeight: 1.6 }}>
              <strong style={{ color: 'var(--text-main)' }}>Ruta de Persistencia VPS:</strong><br />
              <code>/opt/neokikdigital_saas/backend/whatsapp_session/</code>
              <p style={{ marginTop: '0.5rem' }}>
                La sesión se mantiene autenticada permanentemente en el servidor incluso si reinicias el sistema o la aplicación PM2.
              </p>
            </div>
          </div>

          <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
            <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.2rem', fontWeight: '800', marginBottom: '0.5rem' }}>
              Escáner de Autenticación QR
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-sub)', marginBottom: '1.5rem' }}>
              Escanea con la app de WhatsApp de la agencia en tu teléfono para vincular o renovar la sesión.
            </p>

            <div style={{ display: 'inline-block', padding: '1rem', backgroundColor: '#ffffff', borderRadius: 'var(--radius-lg)', border: '2px dashed var(--border-hover)', boxShadow: 'var(--shadow-sm)' }}>
              <img
                src={whatsappStatus?.qrCodeUrl || 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=NeokikDigitalWhatsAppSession'}
                alt="WhatsApp QR Code"
                style={{ width: '200px', height: '200px', borderRadius: '8px' }}
              />
            </div>

            <div style={{ marginTop: '1.25rem', fontSize: '0.78rem', color: '#059669', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
              <ShieldCheck size={15} /> Sesión Baileys Activa - Sin costo de API de terceros
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMACIÓN */}
      {showConfirmModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <h2>Confirmar Despacho de Campaña</h2>
              <button className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem' }} onClick={() => setShowConfirmModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ backgroundColor: '#eff6ff', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid #bfdbfe', marginBottom: '1.25rem' }}>
                <div style={{ fontWeight: '800', color: 'var(--brand-indigo)', fontSize: '1rem', marginBottom: '0.25rem' }}>
                  {campaignForm.title}
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-sub)' }}>
                  Canal: <strong>{campaignForm.channel}</strong> | Destino: <strong>{getTargetAudienceLabel(campaignForm.target_audience)}</strong>
                </div>
              </div>

              <p style={{ fontSize: '0.9rem', color: 'var(--text-main)', lineHeight: 1.5 }}>
                ¿Estás seguro de que deseas iniciar el envío masivo? El sistema despachará el mensaje a todos los clientes seleccionados aplicando las pausas anti-spam automáticas.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowConfirmModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleCreateAndSendCampaign}>
                <Send size={16} /> Confirmar y Despachar Ahora
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
