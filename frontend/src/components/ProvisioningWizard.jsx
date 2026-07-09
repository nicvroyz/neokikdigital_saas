import React, { useState, useEffect, useCallback } from 'react';
import { Building2, Globe, Code2, Server, Mail, Plus, Minus, ChevronRight, ChevronLeft, CheckCircle2, Loader2, Rocket } from 'lucide-react';
import CustomSelect from './CustomSelect';
import MigrationProgress from './MigrationProgress';

const keyframesStyle = `
@keyframes pwSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes pwFadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
`;

const projectTypeOptions = [
  { value: 'WordPress', label: 'WordPress' },
  { value: 'HTML', label: 'HTML Estático' },
  { value: 'PHP', label: 'PHP' },
  { value: 'Laravel', label: 'Laravel' },
  { value: 'React', label: 'React' },
  { value: 'NextJS', label: 'Next.js' },
  { value: 'Otro', label: 'Otro' },
];

const emailPlaceholders = ['ventas', 'contacto', 'gerencia', 'soporte', 'info', 'admin', 'rrhh', 'facturacion'];

export default function ProvisioningWizard({ clients, token, onComplete }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [isExecuting, setIsExecuting] = useState(false);
  const [provisionId, setProvisionId] = useState(null);
  const [provisionLogs, setProvisionLogs] = useState([]);
  const [elapsedTime, setElapsedTime] = useState('0s');
  const [overallStatus, setOverallStatus] = useState('RUNNING');
  const [dnsData, setDnsData] = useState(null);

  const [formData, setFormData] = useState({
    company_name: '',
    domain: '',
    project_type: 'WordPress',
    manages_hosting: true,
    manages_email: true,
    email_count: 3,
    email_accounts: ['ventas', 'contacto', 'gerencia'],
  });

  const updateField = (key, val) => setFormData(prev => ({ ...prev, [key]: val }));

  const handleEmailCountChange = (count) => {
    const c = Math.max(1, Math.min(20, count));
    const accounts = [...formData.email_accounts];
    while (accounts.length < c) accounts.push(emailPlaceholders[accounts.length % emailPlaceholders.length] || '');
    updateField('email_count', c);
    updateField('email_accounts', accounts.slice(0, c));
  };

  const updateEmailAccount = (idx, val) => {
    const accounts = [...formData.email_accounts];
    accounts[idx] = val;
    updateField('email_accounts', accounts);
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1: return formData.company_name.trim() && formData.domain.trim();
      case 2: return true;
      case 3: return true;
      default: return false;
    }
  };

  const handleProvision = async () => {
    setIsExecuting(true);
    setCurrentStep(4);
    const startTime = Date.now();
    const timerInterval = setInterval(() => {
      const diff = Math.floor((Date.now() - startTime) / 1000);
      const mins = Math.floor(diff / 60);
      const secs = diff % 60;
      setElapsedTime(mins > 0 ? `${mins}m ${secs}s` : `${secs}s`);
    }, 1000);

    try {
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

      const createRes = await fetch('/api/infrastructure/provision', {
        method: 'POST', headers, body: JSON.stringify(formData),
      });

      if (!createRes.ok) throw new Error('Error al crear provisión');
      const created = await createRes.json();
      setProvisionId(created.id);

      const execRes = await fetch(`/api/infrastructure/provision/${created.id}/execute`, {
        method: 'POST', headers,
      });

      if (!execRes.ok) throw new Error('Error al ejecutar provisión');

      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/infrastructure/provision/${created.id}`, { headers });
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            if (statusData.steps) setProvisionLogs(statusData.steps);
            if (statusData.dns) setDnsData(statusData.dns);
            if (statusData.status === 'COMPLETED' || statusData.status === 'FAILED') {
              clearInterval(pollInterval);
              clearInterval(timerInterval);
              setOverallStatus(statusData.status);
              setIsExecuting(false);
            }
          }
        } catch (err) {
          console.error('Error al consultar estado:', err);
        }
      }, 2000);
    } catch (err) {
      console.error('Error en provisión:', err);
      clearInterval(timerInterval);
      setOverallStatus('FAILED');
      setIsExecuting(false);
    }
  };

  const wizardSteps = [
    { num: 1, label: 'Datos del Cliente' },
    { num: 2, label: 'Servicios' },
    { num: 3, label: 'Confirmación' },
    { num: 4, label: 'Progreso' },
  ];

  return (
    <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>{keyframesStyle}</style>

      {/* Step Indicator */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: '2.5rem', gap: '0',
      }}>
        {wizardSteps.map((step, idx) => {
          const isActive = currentStep === step.num;
          const isCompleted = currentStep > step.num;
          return (
            <React.Fragment key={step.num}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                <div style={{
                  width: '38px', height: '38px', borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  backgroundColor: isCompleted ? '#16a34a' : isActive ? '#284999' : '#e2e8f0',
                  color: isCompleted || isActive ? '#ffffff' : '#94a3b8',
                  fontWeight: '800', fontSize: '0.85rem',
                  transition: 'all 0.3s ease',
                  boxShadow: isActive ? '0 0 0 4px rgba(40, 73, 153, 0.2)' : 'none',
                }}>
                  {isCompleted ? <CheckCircle2 size={18} /> : step.num}
                </div>
                <span style={{
                  position: 'absolute', top: '46px', whiteSpace: 'nowrap',
                  fontSize: '0.72rem', fontWeight: '700',
                  color: isActive ? '#284999' : isCompleted ? '#16a34a' : '#94a3b8',
                }}>
                  {step.label}
                </span>
              </div>
              {idx < wizardSteps.length - 1 && (
                <div style={{
                  width: '80px', height: '3px', borderRadius: '9999px',
                  backgroundColor: currentStep > step.num ? '#16a34a' : '#e2e8f0',
                  margin: '0 0.5rem', transition: 'background-color 0.3s ease',
                  marginBottom: '1rem',
                }} />
              )}
            </React.Fragment>
          );
        })}
      </div>

      <div style={{ marginTop: '1.5rem', animation: 'pwFadeIn 0.35s ease-out' }}>
        {/* Step 1 - Datos del Cliente */}
        {currentStep === 1 && (
          <div className="card" style={{ maxWidth: '640px', margin: '0 auto' }}>
            <h3 style={{ fontFamily: "'Outfit', sans-serif", fontWeight: '800', fontSize: '1.35rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <Building2 size={22} color="#284999" />
              Datos del Cliente
            </h3>

            <div className="form-group">
              <label className="form-label">Nombre de la Empresa *</label>
              <input
                type="text" className="form-input" required
                placeholder="Ej. Constructora Araucaria SpA"
                value={formData.company_name}
                onChange={(e) => updateField('company_name', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Dominio Principal *</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text" className="form-input"
                  placeholder="Ej. constructora-araucaria"
                  value={formData.domain}
                  onChange={(e) => updateField('domain', e.target.value)}
                  style={{ paddingRight: '3.5rem' }}
                />
                <span style={{
                  position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)',
                  fontSize: '0.82rem', fontWeight: '700', color: 'var(--text-muted, #94a3b8)',
                }}>
                  .cl
                </span>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Tipo de Proyecto *</label>
              <CustomSelect
                options={projectTypeOptions}
                value={formData.project_type}
                onChange={(e) => updateField('project_type', e.target.value)}
                icon={Code2}
              />
            </div>
          </div>
        )}

        {/* Step 2 - Servicios */}
        {currentStep === 2 && (
          <div className="card" style={{ maxWidth: '640px', margin: '0 auto' }}>
            <h3 style={{ fontFamily: "'Outfit', sans-serif", fontWeight: '800', fontSize: '1.35rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <Server size={22} color="#284999" />
              Servicios
            </h3>

            {/* Hosting Toggle */}
            <div className="form-group">
              <label className="form-label">¿Neokik administra el hosting?</label>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                {[true, false].map(val => (
                  <button
                    key={String(val)} type="button"
                    onClick={() => updateField('manages_hosting', val)}
                    style={{
                      flex: 1, padding: '0.85rem', borderRadius: 'var(--radius-md, 12px)',
                      border: formData.manages_hosting === val ? '2px solid #284999' : '1.5px solid #e2e8f0',
                      backgroundColor: formData.manages_hosting === val ? '#eef2ff' : '#ffffff',
                      color: formData.manages_hosting === val ? '#284999' : 'var(--text-sub, #475569)',
                      fontWeight: '800', fontSize: '0.95rem', cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {val ? 'Sí' : 'No'}
                  </button>
                ))}
              </div>
            </div>

            {/* Email Toggle */}
            <div className="form-group">
              <label className="form-label">¿Neokik administra el correo electrónico?</label>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                {[true, false].map(val => (
                  <button
                    key={String(val)} type="button"
                    onClick={() => updateField('manages_email', val)}
                    style={{
                      flex: 1, padding: '0.85rem', borderRadius: 'var(--radius-md, 12px)',
                      border: formData.manages_email === val ? '2px solid #284999' : '1.5px solid #e2e8f0',
                      backgroundColor: formData.manages_email === val ? '#eef2ff' : '#ffffff',
                      color: formData.manages_email === val ? '#284999' : 'var(--text-sub, #475569)',
                      fontWeight: '800', fontSize: '0.95rem', cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {val ? 'Sí' : 'No'}
                  </button>
                ))}
              </div>
            </div>

            {/* Email Accounts */}
            {formData.manages_email && (
              <div style={{ animation: 'pwFadeIn 0.3s ease-out' }}>
                <div className="form-group">
                  <label className="form-label">Cantidad de cuentas de correo</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <button type="button" onClick={() => handleEmailCountChange(formData.email_count - 1)}
                      style={counterBtnStyle}><Minus size={16} /></button>
                    <span style={{ fontWeight: '800', fontSize: '1.2rem', color: '#284999', minWidth: '30px', textAlign: 'center' }}>
                      {formData.email_count}
                    </span>
                    <button type="button" onClick={() => handleEmailCountChange(formData.email_count + 1)}
                      style={counterBtnStyle}><Plus size={16} /></button>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Nombres de las cuentas</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {formData.email_accounts.map((acc, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Mail size={16} color="#284999" style={{ flexShrink: 0 }} />
                        <input
                          type="text" className="form-input"
                          placeholder={emailPlaceholders[idx % emailPlaceholders.length]}
                          value={acc}
                          onChange={(e) => updateEmailAccount(idx, e.target.value)}
                          style={{ flex: 1 }}
                        />
                        <span style={{ fontSize: '0.82rem', fontWeight: '700', color: 'var(--text-muted, #94a3b8)', whiteSpace: 'nowrap' }}>
                          @{formData.domain || 'dominio'}.cl
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 3 - Confirmación */}
        {currentStep === 3 && (
          <div className="card" style={{ maxWidth: '640px', margin: '0 auto' }}>
            <h3 style={{ fontFamily: "'Outfit', sans-serif", fontWeight: '800', fontSize: '1.35rem', marginBottom: '1.5rem' }}>
              Resumen de Provisión
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem' }}>
              {[
                { label: 'Empresa', value: formData.company_name },
                { label: 'Dominio', value: `${formData.domain}.cl` },
                { label: 'Tipo de Proyecto', value: formData.project_type },
                { label: 'Hosting Administrado', value: formData.manages_hosting ? 'Sí — Neokik administra' : 'No — Cliente administra' },
                { label: 'Correo Administrado', value: formData.manages_email ? 'Sí — Neokik administra' : 'No — Cliente administra' },
                ...(formData.manages_email ? [{
                  label: 'Cuentas de Correo',
                  value: formData.email_accounts.map(a => `${a}@${formData.domain}.cl`).join(', '),
                }] : []),
              ].map((item, idx) => (
                <div key={idx} style={{
                  display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                  padding: '0.85rem 1rem', borderRadius: 'var(--radius-sm, 8px)',
                  backgroundColor: '#f8fafc', border: '1px solid #e2e8f0',
                }}>
                  <CheckCircle2 size={18} color="#16a34a" style={{ flexShrink: 0, marginTop: '1px' }} />
                  <div>
                    <div style={{ fontSize: '0.78rem', fontWeight: '700', color: 'var(--text-muted, #94a3b8)', marginBottom: '0.15rem' }}>
                      {item.label}
                    </div>
                    <div style={{ fontSize: '0.9rem', fontWeight: '700', color: 'var(--text-main, #0f172a)' }}>
                      {item.value}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={handleProvision}
              disabled={isExecuting}
              style={{
                width: '100%', padding: '1rem', borderRadius: 'var(--radius-md, 12px)',
                backgroundColor: '#fbb03b', color: '#0f172a', border: 'none',
                fontWeight: '800', fontSize: '1.05rem', cursor: isExecuting ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem',
                transition: 'all 0.2s ease', fontFamily: "'Outfit', sans-serif",
                opacity: isExecuting ? 0.7 : 1,
              }}
              onMouseEnter={(e) => { if (!isExecuting) e.currentTarget.style.backgroundColor = '#f59e0b'; }}
              onMouseLeave={(e) => { if (!isExecuting) e.currentTarget.style.backgroundColor = '#fbb03b'; }}
            >
              {isExecuting ? (
                <><Loader2 size={20} style={{ animation: 'pwSpin 1s linear infinite' }} /> Provisionando...</>
              ) : (
                <><Rocket size={20} /> Provisionar Cliente</>
              )}
            </button>
          </div>
        )}

        {/* Step 4 - Progreso */}
        {currentStep === 4 && (
          <div className="card" style={{ maxWidth: '700px', margin: '0 auto' }}>
            <h3 style={{ fontFamily: "'Outfit', sans-serif", fontWeight: '800', fontSize: '1.35rem', marginBottom: '1.5rem' }}>
              Progreso de Provisión
            </h3>

            <MigrationProgress
              steps={provisionLogs}
              elapsedTime={elapsedTime}
              overallStatus={overallStatus}
            />

            {overallStatus === 'COMPLETED' && dnsData && (
              <div style={{ marginTop: '2rem', animation: 'pwFadeIn 0.5s ease-out' }}>
                <div style={{
                  padding: '1.25rem', borderRadius: 'var(--radius-md, 12px)',
                  backgroundColor: '#f0fdf4', border: '1.5px solid #86efac',
                  textAlign: 'center', marginBottom: '1.5rem',
                }}>
                  <CheckCircle2 size={36} color="#16a34a" style={{ marginBottom: '0.5rem' }} />
                  <div style={{ fontFamily: "'Outfit', sans-serif", fontWeight: '800', fontSize: '1.15rem', color: '#15803d' }}>
                    ¡Provisión Completada Exitosamente!
                  </div>
                  <p style={{ fontSize: '0.85rem', color: '#166534', marginTop: '0.35rem' }}>
                    El cliente ha sido configurado en el servidor VPS.
                  </p>
                </div>

                <h4 style={{ fontFamily: "'Outfit', sans-serif", fontWeight: '800', fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--text-main, #0f172a)' }}>
                  Instrucciones de DNS
                </h4>
                <div style={{
                  padding: '1rem', borderRadius: 'var(--radius-sm, 8px)',
                  backgroundColor: '#f8fafc', border: '1px solid #e2e8f0',
                  fontSize: '0.85rem', color: 'var(--text-sub, #475569)', lineHeight: '1.7',
                }}>
                  {dnsData.instructions ? (
                    <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                      {(Array.isArray(dnsData.instructions) ? dnsData.instructions : [dnsData.instructions]).map((inst, i) => (
                        <li key={i} style={{ marginBottom: '0.35rem' }}>{typeof inst === 'string' ? inst : inst.text}</li>
                      ))}
                    </ul>
                  ) : (
                    <p style={{ margin: 0 }}>Configure los registros DNS del dominio para apuntar al servidor.</p>
                  )}
                </div>

                {onComplete && (
                  <button onClick={onComplete} className="btn btn-primary" style={{ marginTop: '1.5rem', width: '100%', justifyContent: 'center' }}>
                    Finalizar
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation Buttons */}
      {currentStep < 4 && (
        <div style={{
          display: 'flex', justifyContent: currentStep > 1 ? 'space-between' : 'flex-end',
          marginTop: '2rem', maxWidth: '640px', margin: '2rem auto 0',
        }}>
          {currentStep > 1 && (
            <button className="btn btn-secondary" onClick={() => setCurrentStep(prev => prev - 1)}>
              <ChevronLeft size={16} /> Anterior
            </button>
          )}
          {currentStep < 3 && (
            <button className="btn btn-primary" onClick={() => setCurrentStep(prev => prev + 1)} disabled={!canProceed()}>
              Siguiente <ChevronRight size={16} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const counterBtnStyle = {
  width: '36px', height: '36px', borderRadius: '50%',
  border: '1.5px solid #e2e8f0', backgroundColor: '#f8fafc',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', transition: 'all 0.15s ease', padding: 0,
  color: '#284999',
};
