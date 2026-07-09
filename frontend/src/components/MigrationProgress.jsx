import React from 'react';
import { CheckCircle2, XCircle, Loader2, PauseCircle, SkipForward, Clock, Wrench, AlertTriangle } from 'lucide-react';

const keyframesStyle = `
@keyframes mpSpin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@keyframes mpPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(40, 73, 153, 0.35); }
  50% { box-shadow: 0 0 0 8px rgba(40, 73, 153, 0); }
}
@keyframes mpFadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes mpProgressStripe {
  0% { background-position: 1rem 0; }
  100% { background-position: 0 0; }
}
`;

const MIGRATION_TEMPLATE = [
  { step: 'backup:extracting', label: 'Extraer archivos de respaldo', description: 'Descompresión del archivo tar.gz/zip...' },
  { step: 'database:restoring', label: 'Restaurar base de datos', description: 'Configurando motor de base de datos MySQL e importando tablas...' },
  { step: 'container:creating', label: 'Crear contenedor Docker', description: 'Creando contenedor e iniciando servicios aislados del cliente...' },
  { step: 'plugin:executing', label: 'Ejecutar plugins del framework', description: 'Configurando archivo wp-config.php/.env y ejecutando comandos del plugin...' },
  { step: 'ssl:generating', label: 'Configurar enrutamiento SSL', description: 'Generando certificados SSL seguros Let\'s Encrypt en proxy Caddy...' },
  { step: 'mailcow:restoring', label: 'Configurar correo Mailcow', description: 'Configurando cuentas e IMAP en la suite de correos Mailcow...' },
  { step: 'verification:running', label: 'Auditoría de verificación', description: 'Realizando pruebas de salud de HTTP, puertos SMTP e IMAP...' }
];

export default function MigrationProgress({ steps = [], elapsedTime = '0s', overallStatus = 'RUNNING', onRetry }) {
  // Map incoming logs onto the static template
  const displaySteps = MIGRATION_TEMPLATE.map(t => {
    const log = steps.find(s => s.step === t.step);
    if (log) {
      return {
        ...log,
        step: t.label,
        message: log.message || t.description,
        key: t.step
      };
    }
    return {
      step: t.label,
      status: 'PENDING',
      message: t.description,
      key: t.step
    };
  });

  const completedCount = displaySteps.filter(s => s.status === 'SUCCESS' || s.status === 'SKIPPED').length;
  const progressPercent = Math.round((completedCount / displaySteps.length) * 100);
  const failedStep = displaySteps.find(s => s.status === 'FAILED');

  const getStatusIcon = (status) => {
    switch (status) {
      case 'RUNNING':
        return <Loader2 size={20} color="#284999" style={{ animation: 'mpSpin 1s linear infinite' }} />;
      case 'SUCCESS':
        return <CheckCircle2 size={20} color="#16a34a" />;
      case 'FAILED':
        return <XCircle size={20} color="#dc2626" />;
      case 'SKIPPED':
        return <SkipForward size={20} color="#94a3b8" />;
      default:
        return <PauseCircle size={20} color="#cbd5e1" />;
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'RUNNING': return 'En ejecución';
      case 'SUCCESS': return 'Completado';
      case 'FAILED': return 'Error';
      case 'SKIPPED': return 'Omitido';
      default: return 'Pendiente';
    }
  };

  const getStepDuration = (step) => {
    if (!step.startedAt) return '';
    const start = new Date(step.startedAt).getTime();
    const end = step.completedAt ? new Date(step.completedAt).getTime() : Date.now();
    const diff = Math.max(0, Math.floor((end - start) / 1000));
    if (diff < 60) return `${diff}s`;
    const mins = Math.floor(diff / 60);
    const secs = diff % 60;
    return `${mins}m ${secs}s`;
  };

  const getOverallBadge = () => {
    switch (overallStatus) {
      case 'COMPLETED':
        return { label: 'Completado', bg: '#dcfce7', color: '#15803d', icon: CheckCircle2 };
      case 'FAILED':
        return { label: 'Error', bg: '#fee2e2', color: '#dc2626', icon: XCircle };
      default:
        return { label: 'En Progreso', bg: '#dbeafe', color: '#284999', icon: Loader2 };
    }
  };

  const badge = getOverallBadge();
  const BadgeIcon = badge.icon;

  return (
    <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>{keyframesStyle}</style>

      {/* Header Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
            fontSize: '0.8rem', fontWeight: '800', padding: '0.35rem 0.85rem',
            borderRadius: '9999px', backgroundColor: badge.bg, color: badge.color,
          }}>
            <BadgeIcon size={14} style={overallStatus === 'RUNNING' ? { animation: 'mpSpin 1s linear infinite' } : {}} />
            {badge.label}
          </span>
          <span style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-sub, #475569)' }}>
            {completedCount} / {displaySteps.length} pasos
          </span>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.4rem',
          fontSize: '0.9rem', fontWeight: '800', color: '#284999',
          backgroundColor: '#eef2ff', padding: '0.4rem 0.85rem', borderRadius: 'var(--radius-sm, 8px)',
        }}>
          <Clock size={15} />
          {elapsedTime}
        </div>
      </div>

      {/* Overall Progress Bar */}
      <div style={{
        width: '100%', height: '10px', borderRadius: '9999px',
        backgroundColor: '#e2e8f0', overflow: 'hidden', marginBottom: '1.75rem',
      }}>
        <div style={{
          height: '100%', borderRadius: '9999px',
          width: `${overallStatus === 'COMPLETED' ? 100 : progressPercent}%`,
          backgroundColor: overallStatus === 'FAILED' ? '#dc2626' : overallStatus === 'COMPLETED' ? '#16a34a' : '#284999',
          transition: 'width 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
          backgroundImage: overallStatus === 'RUNNING'
            ? 'linear-gradient(45deg, rgba(255,255,255,0.15) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.15) 50%, rgba(255,255,255,0.15) 75%, transparent 75%)'
            : 'none',
          backgroundSize: '1rem 1rem',
          animation: overallStatus === 'RUNNING' ? 'mpProgressStripe 0.5s linear infinite' : 'none',
        }} />
      </div>

      {/* Timeline */}
      <div style={{ position: 'relative', paddingLeft: '2.5rem' }}>
        {/* Vertical line */}
        <div style={{
          position: 'absolute', left: '0.6rem', top: '0.6rem', bottom: '0.6rem',
          width: '2px', backgroundColor: '#e2e8f0',
        }} />

        {displaySteps.map((step, idx) => {
          const isRunning = step.status === 'RUNNING';
          const isFailed = step.status === 'FAILED';

          return (
            <div
              key={step.key || idx}
              style={{
                position: 'relative', marginBottom: idx < displaySteps.length - 1 ? '0.5rem' : 0,
                padding: '1rem 1.25rem', borderRadius: 'var(--radius-md, 12px)',
                backgroundColor: isRunning ? '#f0f4ff' : isFailed ? '#fef2f2' : '#ffffff',
                border: isRunning ? '1.5px solid #284999' : isFailed ? '1.5px solid #fca5a5' : '1px solid #f1f5f9',
                animationName: isRunning ? 'mpPulse, mpFadeIn' : 'mpFadeIn',
                animationDuration: isRunning ? '2s, 0.3s' : '0.3s',
                animationTimingFunction: isRunning ? 'ease-in-out, ease-out' : 'ease-out',
                animationIterationCount: isRunning ? 'infinite, 1' : '1',
                animationDelay: `${idx * 0.05}s`,
                animationFillMode: 'both',
                transition: 'all 0.3s ease',
              }}
            >
              {/* Step dot on timeline */}
              <div style={{
                position: 'absolute', left: '-2.5rem', top: '1.15rem',
                width: '22px', height: '22px', borderRadius: '50%',
                backgroundColor: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 2, border: '2px solid #e2e8f0',
              }}>
                {getStatusIcon(step.status)}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.3rem' }}>
                    <span style={{
                      fontFamily: "'Outfit', sans-serif", fontWeight: '800',
                      fontSize: '0.95rem', color: isRunning ? '#284999' : isFailed ? '#dc2626' : 'var(--text-main, #0f172a)',
                    }}>
                      {step.step}
                    </span>
                    <span style={{
                      fontSize: '0.7rem', fontWeight: '700', padding: '0.15rem 0.5rem',
                      borderRadius: '9999px',
                      backgroundColor: isRunning ? '#dbeafe' : isFailed ? '#fee2e2' : step.status === 'SUCCESS' ? '#dcfce7' : '#f1f5f9',
                      color: isRunning ? '#284999' : isFailed ? '#dc2626' : step.status === 'SUCCESS' ? '#15803d' : '#94a3b8',
                    }}>
                      {getStatusLabel(step.status)}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.84rem', color: 'var(--text-sub, #475569)', margin: 0, lineHeight: '1.5' }}>
                    {step.message}
                  </p>
                </div>
                {step.startedAt && (
                  <span style={{
                    fontSize: '0.78rem', fontWeight: '700', color: 'var(--text-muted, #94a3b8)',
                    whiteSpace: 'nowrap', marginLeft: '1rem',
                  }}>
                    {getStepDuration(step)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Error Details Card */}
      {failedStep && failedStep.details && (
        <div style={{
          marginTop: '1.5rem', padding: '1.25rem', borderRadius: 'var(--radius-md, 12px)',
          backgroundColor: '#fef2f2', border: '1.5px solid #fca5a5',
          animation: 'mpFadeIn 0.4s ease-out',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <AlertTriangle size={18} color="#dc2626" />
            <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: '800', fontSize: '1rem', color: '#dc2626' }}>
              Detalle del Error
            </span>
          </div>
          <pre style={{
            fontSize: '0.82rem', color: '#7f1d1d', backgroundColor: '#fff5f5',
            padding: '0.85rem', borderRadius: 'var(--radius-sm, 8px)',
            overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            margin: '0 0 1rem 0', border: '1px solid #fecaca',
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          }}>
            {failedStep.details}
          </pre>
          {onRetry && (
            <button
              onClick={onRetry}
              className="btn btn-primary"
              style={{
                backgroundColor: '#dc2626', border: 'none', padding: '0.7rem 1.35rem',
                display: 'flex', alignItems: 'center', gap: '0.5rem',
              }}
            >
              <Wrench size={16} />
              Intentar Reparación Automática
            </button>
          )}
        </div>
      )}
    </div>
  );
}
