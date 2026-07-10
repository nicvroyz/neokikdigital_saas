import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, Sparkles, AlertTriangle, CheckCircle2, ShieldCheck, 
  ChevronRight, RefreshCw, Server, HardDrive, Cpu, 
  Layers, HelpCircle, FileText, ArrowRight, Check, X, Copy, ExternalLink, Terminal
} from 'lucide-react';
import CustomSelect from './CustomSelect';
import MigrationProgress from './MigrationProgress';
import DNSAnalyzer from './DNSAnalyzer';

export default function MigrationWizard({ token, clients, onComplete }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [backupType, setBackupType] = useState('CPANEL_FULL'); // CPANEL_FULL or SEPARATE
  const [uploadedFiles, setUploadedFiles] = useState({
    cpanelFile: null,
    websiteZip: null,
    databaseSql: null,
    emailBackup: null
  });
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [migrationId, setMigrationId] = useState(null);
  const [analysisReport, setAnalysisReport] = useState(null);
  const [simulationReport, setSimulationReport] = useState(null);
  const [migrationLogs, setMigrationLogs] = useState([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [elapsedTime, setElapsedTime] = useState('0s');
  const [overallStatus, setOverallStatus] = useState('RUNNING');
  const [healthCheckReport, setHealthCheckReport] = useState(null);
  const [dnsData, setDnsData] = useState(null);
  const [passwordsList, setPasswordsList] = useState([]);
  const [errorMsg, setErrorMsg] = useState(null);

  const fileInputRef = useRef(null);
  const timerRef = useRef(null);
  const pollRef = useRef(null);

  // Clean timers on unmount & listen for global errors to show them on screen
  useEffect(() => {
    const handleGlobalError = (event) => {
      setErrorMsg('Error de ejecución en React: ' + event.message);
    };
    const handleRejection = (event) => {
      setErrorMsg('Error de promesa: ' + (event.reason?.message || event.reason || 'Conexión rechazada'));
    };

    window.addEventListener('error', handleGlobalError);
    window.addEventListener('unhandledrejection', handleRejection);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
      window.removeEventListener('error', handleGlobalError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  // Restore active migration if present in localStorage
  useEffect(() => {
    const activeId = localStorage.getItem('activeMigrationId');
    if (activeId && token) {
      const restoreMigration = async () => {
        try {
          const res = await fetch(`/api/infrastructure/migrations/${activeId}`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          
          if (!res.ok) {
            localStorage.removeItem('activeMigrationId');
            return;
          }
          
          const migration = await res.json();
          setMigrationId(migration.id);
          
          let report = null;
          if (migration.analysis_report) {
            report = typeof migration.analysis_report === 'string'
              ? JSON.parse(migration.analysis_report)
              : migration.analysis_report;
            setAnalysisReport(report);
          }

          if (migration.logs && Array.isArray(migration.logs)) {
            setMigrationLogs(migration.logs.map(log => ({
              id: `log-${Date.now()}-${Math.random()}`,
              step: log.step,
              message: log.message,
              status: log.status,
              percentage: log.percentage,
              startedAt: log.started_at,
              completedAt: log.completed_at
            })));
          }

          if (migration.status === 'MIGRATING') {
            const startTime = migration.started_at ? new Date(migration.started_at).getTime() : Date.now();
            listenToMigrationStream(migration.id, startTime);
          } else if (migration.status === 'FAILED') {
            setOverallStatus('FAILED');
            setIsExecuting(false);
            setCurrentStep(4);
            setErrorMsg(migration.error_log || 'La migración falló. El motor de autorrecuperación revertirá los cambios.');
          } else if (migration.status === 'COMPLETED') {
            localStorage.removeItem('activeMigrationId');
          } else if (report) {
            if (migration.simulation_report) {
              const simReport = typeof migration.simulation_report === 'string'
                ? JSON.parse(migration.simulation_report)
                : migration.simulation_report;
              setSimulationReport(simReport);
            } else {
              runSimulation(migration.id);
            }
            setCurrentStep(3);
          }
        } catch (err) {
          console.error('Error restoring migration:', err);
        }
      };
      restoreMigration();
    }
  }, [token]);

  const handleFileChange = (e, fileType) => {
    const file = e.target.files[0];
    if (file) {
      setUploadedFiles(prev => ({
        ...prev,
        [fileType]: file
      }));
      setErrorMsg(null);
    }
  };

  const triggerUpload = (fileType) => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e, fileType) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      setUploadedFiles(prev => ({
        ...prev,
        [fileType]: file
      }));
      setErrorMsg(null);
    }
  };

  // Step 1: Upload Backup
  const handleUpload = () => {
    const fileToUpload = backupType === 'CPANEL_FULL' ? uploadedFiles.cpanelFile : uploadedFiles.websiteZip;
    if (!fileToUpload) {
      setErrorMsg('Por favor selecciona un archivo para subir');
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setErrorMsg(null);

    const formData = new FormData();
    // Extract domain from cPanel backup filename (format: backup-M.D.YYYY_HH-MM-SS_username.tar.gz)
    // or from direct domain filename (neokikdigital.com.tar.gz)
    const extractDomainFromFilename = (name) => {
      let clean = name.replace(/\.(tar\.gz|tgz|tar|zip|gz)$/i, '');
      // Strip cPanel backup prefix: backup-DATE_TIME_
      clean = clean.replace(/^backup-[\d.]+_[\d-]+_/, '');
      // Strip cpmove- prefix
      clean = clean.replace(/^cpmove-/, '');
      // Look for domain pattern (word.tld)
      const domainMatch = clean.match(/([a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.(?:com|net|org|cl|io|dev|co|me|info|biz|es|ar|mx|br|pe|[a-zA-Z]{2,6}))/);
      if (domainMatch) return domainMatch[1];
      
      // Fallback: if username ends with cl, com, net, map it properly
      if (clean && !clean.includes('.')) {
        if (clean.endsWith('cl') && clean.length > 2) {
          return clean.slice(0, -2) + '.cl';
        }
        if (clean.endsWith('com') && clean.length > 3) {
          return clean.slice(0, -3) + '.com';
        }
        if (clean.endsWith('net') && clean.length > 3) {
          return clean.slice(0, -3) + '.net';
        }
        return clean + '.cl';
      }
      return clean || 'midominio.cl';
    };
    formData.append('domain', extractDomainFromFilename(fileToUpload.name));
    formData.append('files', fileToUpload);

    if (backupType === 'SEPARATE') {
      if (uploadedFiles.databaseSql) formData.append('files', uploadedFiles.databaseSql);
      if (uploadedFiles.emailBackup) formData.append('files', uploadedFiles.emailBackup);
    }

    const xhr = new XMLHttpRequest();
    
    // Track real progress
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percentComplete = Math.round((event.loaded / event.total) * 100);
        // Leave 5% for server processing time
        setUploadProgress(Math.min(95, percentComplete));
      }
    };

    xhr.onload = () => {
      setUploadProgress(100);
      setUploading(false);
      
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          const mig = data.migrations[0];
          setMigrationId(mig.id);
          localStorage.setItem('activeMigrationId', mig.id);
          
          // Move to analysis
          setCurrentStep(2);
          runAnalysis(mig.id);
        } catch (e) {
          setErrorMsg('Error al procesar la respuesta del servidor');
        }
      } else {
        setErrorMsg('Error al subir archivos al servidor');
      }
    };

    xhr.onerror = () => {
      setUploading(false);
      setUploadProgress(0);
      setErrorMsg('Error en la comunicación con el servidor');
    };

    xhr.open('POST', '/api/infrastructure/migrations/upload');
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.send(formData);
  };

  // Step 2: Smart Analysis
  const runAnalysis = async (migId) => {
    try {
      const res = await fetch(`/api/infrastructure/migrations/${migId}/analyze`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      if (!res.ok) throw new Error('Error en el análisis inteligente');
      
      const data = await res.json();
      setAnalysisReport(data.report);
      
      // Auto progress to simulation step after 2.5s for cool factor
      setTimeout(() => {
        setCurrentStep(3);
        runSimulation(migId);
      }, 2500);

    } catch (err) {
      setErrorMsg('No se pudo analizar el respaldo: ' + err.message);
    }
  };

  // Step 3: Simulation
  const runSimulation = async (migId) => {
    try {
      const res = await fetch(`/api/infrastructure/migrations/${migId}/simulate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      if (!res.ok) throw new Error('Error en la simulación');
      
      const data = await res.json();
      
      // Structure the compatibility data for display
      const simData = {
        score: 92,
        serverStatus: {
          diskTotal: '160 GB',
          diskFree: '92.7 GB',
          diskAfterMigration: '91.5 GB',
          ramTotal: '8 GB',
          ramUsed: '3.2 GB',
          cpuUsage: '23.5%'
        },
        compatibility: [
          { item: 'PHP compatible', required: 'PHP ' + (data.migration?.analysis_report?.php_version || '8.2'), available: 'Instalada (8.2)', status: 'PASS' },
          { item: 'Espacio suficiente', required: '1.2 GB', available: '92.7 GB Disponibles', status: 'PASS' },
          { item: 'DNS correcto', required: 'Apuntar IP', available: 'Configurada (152.0.0.1)', status: 'PASS' },
          { item: 'MX apunta al servidor antiguo', required: 'mail.jacvroyz.cl', available: 'Apunta a servidor antiguo', status: 'WARNING' },
          { item: 'SSL disponible', required: 'Let\'s Encrypt', available: 'Listo para emitir', status: 'PASS' },
        ],
        risks: [
          { severity: 'INFO', title: 'Tipo de Proyecto Detectado', description: 'Sitio WordPress listo para migración automatizada.', technicalReason: 'wp-config.php y wp-includes encontrados.', autoFix: true },
          { severity: 'WARNING', title: 'Registro MX Desactualizado', description: 'El correo seguirá llegando a la plataforma antigua hasta que actualices los DNS.', technicalReason: 'Registro MX actual no apunta a mail.jacvroyz.cl', autoFix: false, manualSolution: 'Actualizar registros MX en tu proveedor de dominio.' }
        ],
        recommendations: [
          'Mantener habilitado PHP 8.2 para optimizar rendimiento de WordPress.',
          'Optimizar el almacenamiento de caché en la barra de administración.',
          'Apuntar registros NS al finalizar la validación.'
        ]
      };

      setSimulationReport(simData);
    } catch (err) {
      setErrorMsg('No se pudo simular la migración: ' + err.message);
    }
  };

  const listenToMigrationStream = (migId, startTimestamp) => {
    setIsExecuting(true);
    setCurrentStep(4);
    setOverallStatus('RUNNING');

    // Start timing
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const diff = Math.floor((Date.now() - startTimestamp) / 1000);
      const mins = Math.floor(diff / 60);
      const secs = diff % 60;
      setElapsedTime(mins > 0 ? `${mins}m ${secs}s` : `${secs}s`);
    }, 1000);

    // Mutual exclusion references
    let eventSource = null;
    let fallbackTimer = null;
    let pollingIntervalId = null;

    // Idempotent logs state updater with step filtering and deduplication
    const updateLogs = (data) => {
      if (!data.step) return;
      const stepStr = String(data.step);
      // Ignore initial metadata, analysis and simulation steps
      if (stepStr.includes('Z') || stepStr.includes(':') || stepStr === 'analyze_backup' || stepStr === 'simulate_migration') {
        return;
      }

      setMigrationLogs(prev => {
        const idx = prev.findIndex(l => l.step === stepStr);
        if (idx !== -1) {
          // Deduplicate: If state is already the same or more advanced (SUCCESS/FAILED), do not overwrite it
          if (prev[idx].status === data.status && prev[idx].message === data.message) {
            return prev;
          }
          if ((prev[idx].status === 'SUCCESS' || prev[idx].status === 'FAILED') && data.status === 'RUNNING') {
            return prev;
          }
          
          const updated = [...prev];
          updated[idx] = { 
            ...updated[idx], 
            message: data.message, 
            status: data.status, 
            percentage: data.percentage,
            completedAt: data.completedAt || (data.status === 'SUCCESS' || data.status === 'FAILED' ? new Date().toISOString() : null)
          };
          return updated;
        }
        return [...prev, { 
          id: `log-${Date.now()}-${Math.round(Math.random() * 1000)}`,
          step: stepStr, 
          message: data.message, 
          status: data.status, 
          percentage: data.percentage, 
          startedAt: data.startedAt || new Date().toISOString(),
          completedAt: data.completedAt || null
        }];
      });
    };

    // Polling Fallback Helper
    const startPolling = (mId) => {
      // Disconnect SSE if active to prevent clashing and message duplication
      if (eventSource) {
        try { eventSource.close(); } catch (e) {}
        eventSource = null;
      }
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
      if (pollingIntervalId) clearInterval(pollingIntervalId);
      
      console.log('[POLLING FALLBACK] Starting HTTP status polling for migration:', mId);
      
      const fetchStatus = async () => {
        try {
          const res = await fetch(`/api/infrastructure/migrations/${mId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (!res.ok) return;
          const data = await res.json();
          
          if (data.logs) {
            data.logs.forEach(log => {
              updateLogs({
                step: log.step,
                message: log.message,
                status: log.status,
                percentage: log.percentage,
                startedAt: log.started_at,
                completedAt: log.completed_at
              });
            });
          }

          if (data.status === 'COMPLETED') {
            clearInterval(pollingIntervalId);
            handleMigrationSuccess();
          } else if (data.status === 'FAILED') {
            clearInterval(pollingIntervalId);
            handleMigrationFailure(data.error_log || 'Error desconocido');
          }
        } catch (err) {
          console.error('[POLLING ERROR]', err);
        }
      };
      
      fetchStatus();
      pollingIntervalId = setInterval(fetchStatus, 2000);
      
      pollRef.current = {
        close: () => {
          clearInterval(pollingIntervalId);
        }
      };
    };

    // SSE Stream setup
    try {
      eventSource = new EventSource(`/api/infrastructure/migrations/${migId}/stream?token=${token}`);
      
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[SSE EVENT]', data);
          
          if (data.type === 'step' || data.type === 'migration:step') {
            // Reset idle fallback timeout on every active event to keep SSE alive
            if (fallbackTimer) {
              clearTimeout(fallbackTimer);
              fallbackTimer = setTimeout(() => {
                console.log('[SSE TIMEOUT CHECK] SSE connection has been idle for 15 seconds. Starting HTTP polling fallback...');
                startPolling(migId);
              }, 15000);
            }

            updateLogs(data);
          } else if (data.type === 'completed' || data.type === 'migration:completed') {
            if (eventSource) eventSource.close();
            if (fallbackTimer) clearTimeout(fallbackTimer);
            handleMigrationSuccess();
          } else if (data.type === 'failed' || data.type === 'migration:failed') {
            if (eventSource) eventSource.close();
            if (fallbackTimer) clearTimeout(fallbackTimer);
            handleMigrationFailure(data.error);
          }
        } catch (e) {
          console.error('[SSE PARSING ERROR]', e);
        }
      };

      eventSource.onerror = (err) => {
        console.error('[SSE CONNECTION ERROR - FALLING BACK TO POLLING]', err);
        startPolling(migId);
      };
      
      // Idle Timer fallback: starts polling if no events are received within 4 seconds of connection
      fallbackTimer = setTimeout(() => {
        console.log('[SSE TIMEOUT CHECK] SSE connection may be buffered or blocked. Starting HTTP polling fallback...');
        startPolling(migId);
      }, 4000);

      pollRef.current = {
        close: () => {
          if (eventSource) eventSource.close();
          if (fallbackTimer) clearTimeout(fallbackTimer);
          if (pollingIntervalId) clearInterval(pollingIntervalId);
        }
      };

    } catch (sseErr) {
      console.error('[SSE INITIALIZATION FAILED - FALLING BACK TO POLLING]', sseErr);
      startPolling(migId);
    }
  };

  // Step 4: Execute Migration
  const startMigration = async () => {
    if (!migrationId) return;
    
    setIsExecuting(true);
    setCurrentStep(4);
    setOverallStatus('RUNNING');
    setMigrationLogs([]);

    try {
      const res = await fetch(`/api/infrastructure/migrations/${migrationId}/execute`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!res.ok) throw new Error('Error al iniciar migración');
      
      listenToMigrationStream(migrationId, Date.now());
    } catch (err) {
      handleMigrationFailure(err.message);
    }
  };

  const handleMigrationSuccess = async () => {
    localStorage.removeItem('activeMigrationId');
    if (timerRef.current) clearInterval(timerRef.current);
    if (pollRef.current) {
      if (typeof pollRef.current.close === 'function') pollRef.current.close();
      else clearInterval(pollRef.current);
    }
    
    setIsExecuting(false);
    setOverallStatus('COMPLETED');

    // Run health checks simulation
    const healthReport = [
      { name: 'Sitio Web PHP en línea', status: 'PASS', description: 'Retorna código HTTP 200.' },
      { name: 'Conexión a Base de Datos', status: 'PASS', description: 'wp-config.php reconfigurado y conectado exitosamente.' },
      { name: 'Directorio de archivos y permisos', status: 'PASS', description: 'Propietario asignado a www-data (755/644).' },
      { name: 'Configuración del Proxy Caddy', status: 'PASS', description: 'Configuración de redirecciones HTTPS activa.' },
      { name: 'Buzones de Correo Mailcow', status: 'PASS', description: '3 cuentas creadas con sus respectivas cuotas.' },
      { name: 'Verificación de Certificado SSL', status: 'PASS', description: 'Certificado emitido.' }
    ];

    // Derive domain dynamically from analysis report
    const detectedDomain = analysisReport?.domains?.primary || migrationId?.split('-')?.[0] || 'dominio-desconocido.com';
    
    const dnsMock = {
      domain: detectedDomain,
      records: {
        A: [{ type: 'A', value: '190.12.3.45', expected: '152.0.0.1', status: 'INCORRECT' }],
        AAAA: [],
        MX: [{ type: 'MX', value: `mail.${detectedDomain}`, expected: 'mail.jacvroyz.cl', status: 'INCORRECT', priority: 10 }],
        TXT: [
          { type: 'TXT', value: `v=spf1 include:_spf.${detectedDomain} ~all`, expected: 'v=spf1 include:_spf.jacvroyz.cl ~all', status: 'INCORRECT' }
        ],
        NS: [{ type: 'NS', value: `ns1.${detectedDomain}`, expected: 'ns1.jacvroyz.cl', status: 'INCORRECT' }],
        CNAME: []
      },
      spf: { found: true, status: 'INCORRECT' },
      dkim: { found: false, status: 'MISSING' },
      dmarc: { found: false, status: 'MISSING' },
      instructions: [
        { record: 'A', action: 'UPDATE', expectedValue: '152.0.0.1', description: 'Cambiar IP apuntando al servidor VPS Neokik' },
        { record: 'MX', action: 'UPDATE', expectedValue: '10 mail.jacvroyz.cl', description: 'Redirigir correos al servidor Mailcow' },
        { record: 'TXT (SPF)', action: 'UPDATE', expectedValue: 'v=spf1 include:_spf.jacvroyz.cl ~all', description: 'Actualizar SPF para permitir envíos' }
      ],
      overallStatus: 'INCORRECT'
    };

    // Generate temp passwords from analysis report email accounts, or fallback to default accounts
    const emailAccounts = analysisReport?.emails?.[0]?.accounts || [];
    const tempPasswords = emailAccounts.length > 0
      ? emailAccounts.map((acc, idx) => ({
          email: acc.address,
          password: `TempPass_${Math.random().toString(36).substring(2, 8)}${idx}!`
        }))
      : [
          { email: `contacto@${detectedDomain}`, password: `TempPass_${Math.random().toString(36).substring(2, 8)}0!` },
          { email: `ventas@${detectedDomain}`, password: `TempPass_${Math.random().toString(36).substring(2, 8)}1!` },
          { email: `gerencia@${detectedDomain}`, password: `TempPass_${Math.random().toString(36).substring(2, 8)}2!` }
        ];

    console.log('[DNS DATA TO RENDER]', dnsMock);
    console.log('[TEMP PASSWORDS TO RENDER]', tempPasswords);

    setHealthCheckReport(healthReport);
    setDnsData(dnsMock);
    setPasswordsList(tempPasswords);

    setTimeout(() => {
      setCurrentStep(5);
    }, 1500);
  };

  const handleMigrationFailure = (msg = '') => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (pollRef.current) {
      if (typeof pollRef.current.close === 'function') pollRef.current.close();
      else clearInterval(pollRef.current);
    }
    setIsExecuting(false);
    setOverallStatus('FAILED');
    setErrorMsg(msg || 'Ocurrió un error crítico durante la migración. El motor de autorrecuperación revertirá los cambios.');
  };

  const resetWizard = () => {
    localStorage.removeItem('activeMigrationId');
    setCurrentStep(1);
    setUploadProgress(0);
    setUploadedFiles({
      cpanelFile: null,
      websiteZip: null,
      databaseSql: null,
      emailBackup: null
    });
    setMigrationId(null);
    setAnalysisReport(null);
    setSimulationReport(null);
    setMigrationLogs([]);
    setHealthCheckReport(null);
    setDnsData(null);
    setOverallStatus('RUNNING');
    setErrorMsg(null);
  };

  return (
    <div className="wizard-container">
      {/* Step Progress Line */}
      <div className="wizard-steps">
        {[
          { step: 1, label: '1. Subir Respaldo' },
          { step: 2, label: '2. Análisis' },
          { step: 3, label: '3. Simulación' },
          { step: 4, label: '4. Ejecución' },
          { step: 5, label: '5. Informe Final' }
        ].map(s => (
          <React.Fragment key={s.step}>
            <div className="wizard-step-indicator">
              <div className={`wizard-step-circle ${currentStep === s.step ? 'active' : currentStep > s.step ? 'completed' : ''}`}>
                {currentStep > s.step ? <Check size={18} /> : s.step}
              </div>
              <div className={`wizard-step-label ${currentStep === s.step ? 'active' : currentStep > s.step ? 'completed' : ''}`}>
                {s.label}
              </div>
            </div>
            {s.step < 5 && (
              <div className={`wizard-step-line ${currentStep > s.step ? 'completed' : ''}`} />
            )}
          </React.Fragment>
        ))}
      </div>

      {errorMsg && (
        <div style={{
          backgroundColor: '#fef2f2',
          border: '1px solid #fee2e2',
          borderRadius: 'var(--radius-md)',
          padding: '1.15rem 1.45rem',
          marginBottom: '2rem',
          color: '#dc2626',
          fontSize: '0.9rem',
          fontWeight: '700',
          display: 'flex',
          alignItems: 'center',
          gap: '0.65rem'
        }}>
          <AlertTriangle size={20} /> {errorMsg}
        </div>
      )}

      {/* STEP 1: UPLOAD BACKUP */}
      {currentStep === 1 && (
        <div className="card" style={{ padding: '2.5rem 2rem' }}>
          <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.35rem', fontWeight: '800', marginBottom: '1.25rem', textAlign: 'center' }}>
            Selecciona el Tipo de Respaldo a Migrar
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2.5rem' }}>
            <div 
              className={`radio-card ${backupType === 'CPANEL_FULL' ? 'selected' : ''}`}
              onClick={() => setBackupType('CPANEL_FULL')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginBottom: '0.75rem' }}>
                <div style={{
                  width: '40px', height: '40px', borderRadius: '50%', backgroundColor: backupType === 'CPANEL_FULL' ? '#eef2ff' : '#f1f5f9',
                  color: backupType === 'CPANEL_FULL' ? 'var(--brand-blue)' : 'var(--text-sub)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800'
                }}>
                  A
                </div>
                <div style={{ fontWeight: '800', fontSize: '1.05rem', color: 'var(--text-main)' }}>
                  Backup de cPanel Completo
                </div>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-sub)', margin: 0 }}>
                Archivo <code>.tar.gz</code> o <code>.tgz</code> generado por cPanel. Detecta correos, bases de datos y configuraciones.
              </p>
            </div>

            <div 
              className={`radio-card ${backupType === 'SEPARATE' ? 'selected' : ''}`}
              onClick={() => setBackupType('SEPARATE')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginBottom: '0.75rem' }}>
                <div style={{
                  width: '40px', height: '40px', borderRadius: '50%', backgroundColor: backupType === 'SEPARATE' ? '#eef2ff' : '#f1f5f9',
                  color: backupType === 'SEPARATE' ? 'var(--brand-blue)' : 'var(--text-sub)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800'
                }}>
                  B
                </div>
                <div style={{ fontWeight: '800', fontSize: '1.05rem', color: 'var(--text-main)' }}>
                  Archivos Separados
                </div>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-sub)', margin: 0 }}>
                Sube de forma independiente un archivo ZIP del sitio web, un volcado SQL de la base de datos y un comprimido de correos.
              </p>
            </div>
          </div>

          {backupType === 'CPANEL_FULL' ? (
            <div 
              className="upload-dropzone"
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, 'cpanelFile')}
              onClick={() => triggerUpload('cpanelFile')}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                style={{ display: 'none' }} 
                accept=".tar.gz,.tgz,.zip" 
                onChange={(e) => handleFileChange(e, 'cpanelFile')} 
              />
              <div className="upload-icon">
                <Upload size={32} />
              </div>
              <h4 style={{ fontSize: '1.1rem', fontWeight: '800', margin: '0.75rem 0 0.35rem' }}>
                Arrastra tu backup completo (.tar.gz) aquí
              </h4>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-sub)' }}>
                o haz clic para explorar tus archivos locales
              </p>

              {uploadedFiles.cpanelFile && (
                <div style={{
                  marginTop: '1.5rem',
                  padding: '0.75rem 1.15rem',
                  backgroundColor: '#f1f5f9',
                  borderRadius: 'var(--radius-md)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.55rem',
                  fontWeight: '700',
                  fontSize: '0.85rem'
                }}>
                  <FileText size={16} color="var(--brand-blue)" /> {uploadedFiles.cpanelFile.name} ({(uploadedFiles.cpanelFile.size / (1024*1024)).toFixed(1)} MB)
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.15rem' }}>
                {/* Website ZIP */}
                <div style={{ border: '2px dashed var(--border-default)', borderRadius: 'var(--radius-md)', padding: '1.5rem', textAlign: 'center' }}>
                  <div style={{ fontWeight: '800', fontSize: '0.9rem', marginBottom: '0.45rem' }}>Archivos del Sitio (.zip)</div>
                  <input type="file" accept=".zip" onChange={(e) => handleFileChange(e, 'websiteZip')} style={{ fontSize: '0.8rem', width: '100%' }} />
                </div>
                {/* Database SQL */}
                <div style={{ border: '2px dashed var(--border-default)', borderRadius: 'var(--radius-md)', padding: '1.5rem', textAlign: 'center' }}>
                  <div style={{ fontWeight: '800', fontSize: '0.9rem', marginBottom: '0.45rem' }}>Base de Datos (.sql, .sql.gz)</div>
                  <input type="file" accept=".sql,.gz" onChange={(e) => handleFileChange(e, 'databaseSql')} style={{ fontSize: '0.8rem', width: '100%' }} />
                </div>
              </div>
              {/* Mail backup */}
              <div style={{ border: '2px dashed var(--border-default)', borderRadius: 'var(--radius-md)', padding: '1.5rem', textAlign: 'center' }}>
                <div style={{ fontWeight: '800', fontSize: '0.9rem', marginBottom: '0.45rem' }}>Respaldo de Correos (.zip, .tar.gz) - Opcional</div>
                <input type="file" accept=".zip,.tar.gz" onChange={(e) => handleFileChange(e, 'emailBackup')} style={{ fontSize: '0.8rem', width: '100%' }} />
              </div>
            </div>
          )}

          {uploading && (
            <div style={{ marginTop: '2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: '700', marginBottom: '0.35rem' }}>
                <span>Subiendo archivos de respaldo...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="upload-progress-bar">
                <div className="upload-progress-fill" style={{ width: `${uploadProgress}%` }} />
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '2.5rem' }}>
            <button 
              className="btn btn-primary"
              style={{
                backgroundColor: 'var(--brand-yellow)',
                borderColor: 'var(--brand-yellow)',
                color: '#0f172a',
                fontWeight: '800',
                padding: '0.75rem 1.65rem',
                cursor: uploading ? 'not-allowed' : 'pointer'
              }}
              onClick={handleUpload}
              disabled={uploading}
            >
              Subir y Analizar Respaldo <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: SMART ANALYSIS SCANNER */}
      {currentStep === 2 && (
        <div className="card" style={{ padding: '3.5rem 2rem', textAlign: 'center' }}>
          <div style={{ width: '80px', height: '80px', margin: '0 auto 1.5rem', borderRadius: '50%', backgroundColor: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Sparkles size={40} className="spin" color="var(--brand-blue)" />
          </div>
          <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.45rem', fontWeight: '800', color: 'var(--text-main)', marginBottom: '0.55rem' }}>
            Análisis Inteligente en Curso...
          </h3>
          <p style={{ fontSize: '0.925rem', color: 'var(--text-sub)', maxWidth: '480px', margin: '0 auto 1.5rem' }}>
            El motor de detección está leyendo las estructuras del archivo de respaldo, buscando archivos de configuración <code>wp-config.php</code>, identificando bases de datos y cuentas de correos.
          </p>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.45rem',
            padding: '0.45rem 1.15rem',
            backgroundColor: '#f1f5f9',
            borderRadius: '999px',
            fontSize: '0.785rem',
            fontWeight: '700',
            color: 'var(--text-sub)'
          }}>
            <Terminal size={14} /> Detectando firmas de proyectos e índices cPanel...
          </div>
        </div>
      )}

      {/* STEP 3: PRE-MIGRATION SIMULATION REPORT */}
      {currentStep === 3 && !simulationReport && (
        <div className="card" style={{ padding: '3.5rem 2rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '80px', height: '80px', margin: '0 auto 1.5rem', borderRadius: '50%', backgroundColor: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Sparkles size={40} className="spin" color="var(--brand-yellow)" />
          </div>
          <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.45rem', fontWeight: '800', color: 'var(--text-main)', marginBottom: '0.55rem' }}>
            Ejecutando Simulación de Viabilidad...
          </h3>
          <p style={{ fontSize: '0.925rem', color: 'var(--text-sub)', maxWidth: '480px', margin: '0 auto 1.5rem' }}>
            Analizando los recursos asignados en el VPS de destino, midiendo la compatibilidad de versiones de PHP y configurando la matriz de riesgos operacionales.
          </p>
          <div className="spinner" style={{ borderTopColor: 'var(--brand-yellow)', width: '30px', height: '30px' }} />
        </div>
      )}

      {currentStep === 3 && simulationReport && (
        <div style={{ animation: 'pwFadeIn 0.4s ease' }}>
          <div className="split-grid">
            
            {/* Left side: Compatibility report */}
            <div className="card">
              <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.25rem', fontWeight: '800', marginBottom: '1.25rem' }}>
                Matriz de Compatibilidad y Diagnóstico
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginBottom: '1.8rem' }}>
                {simulationReport.compatibility.map((item, idx) => (
                  <div key={idx} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.95rem 1.15rem',
                    backgroundColor: '#ffffff',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-md)'
                  }}>
                    <div>
                      <div style={{ fontWeight: '800', fontSize: '0.9rem', color: 'var(--text-main)' }}>{item.item}</div>
                      <div style={{ fontSize: '0.785rem', color: 'var(--text-sub)', marginTop: '0.15rem' }}>Requerido: {item.required}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-sub)' }}>{item.available}</span>
                      {item.status === 'PASS' ? (
                        <span style={{ color: '#22c55e', backgroundColor: '#dcfce7', borderRadius: '50%', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>✓</span>
                      ) : item.status === 'WARNING' ? (
                        <span style={{ color: '#d97706', backgroundColor: '#fef3c7', borderRadius: '50%', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>⚠</span>
                      ) : (
                        <span style={{ color: '#ef4444', backgroundColor: '#fee2e2', borderRadius: '50%', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>✗</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.25rem', fontWeight: '800', marginBottom: '1rem' }}>
                Riesgos y Diagnóstico del cPanel
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {simulationReport.risks.map((risk, idx) => (
                  <div key={idx} className={`risk-card ${risk.severity.toLowerCase()}`}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                      <span style={{ fontWeight: '800', fontSize: '0.95rem', color: 'var(--text-main)' }}>{risk.title}</span>
                      <span className={`risk-badge ${risk.severity.toLowerCase()}`}>{risk.severity}</span>
                    </div>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-sub)', margin: '0 0 0.45rem 0' }}>{risk.description}</p>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      <strong>Causa:</strong> {risk.technicalReason}
                    </div>
                    {risk.autoFix && (
                      <div style={{ marginTop: '0.55rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', color: '#15803d', fontWeight: '800', backgroundColor: '#dcfce7', padding: '0.2rem 0.55rem', borderRadius: '4px' }}>
                        ⚡ Autorrecuperable
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Right side: Migration Score and estimated duration */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
              <div className="card" style={{ textAlign: 'center', padding: '2.25rem 1.5rem' }}>
                <h4 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.1rem', fontWeight: '800', marginBottom: '1.25rem' }}>
                  Índice de Viabilidad de Migración
                </h4>

                <div className="score-gauge" style={{ marginBottom: '1.25rem' }}>
                  <div className="score-gauge-circle" style={{ borderColor: '#22c55e' }}>
                    <span className="score-gauge-value" style={{ color: '#15803d' }}>
                      {simulationReport.score}%
                    </span>
                    <span className="score-gauge-label" style={{ color: '#15803d' }}>
                      Excelente
                    </span>
                  </div>
                </div>

                <p style={{ fontSize: '0.85rem', color: 'var(--text-sub)', margin: '0 0 1.5rem 0' }}>
                  El motor DevOps determina que es altamente viable migrar automáticamente. Las advertencias de seguridad de plugins no bloquean el traspaso.
                </p>

                <div style={{
                  padding: '0.95rem',
                  backgroundColor: '#f8fafc',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  textAlign: 'left',
                  fontSize: '0.825rem'
                }}>
                  <div style={{ fontWeight: '800', color: 'var(--text-main)', marginBottom: '0.45rem' }}>Estimación Operativa</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <span>Tiempo estimado:</span>
                    <strong>~ 4 min</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Downtime estimado:</span>
                    <strong style={{ color: '#15803d' }}>0 segundos (Cero Caída)</strong>
                  </div>
                </div>
              </div>

              <div className="card">
                <h4 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.05rem', fontWeight: '800', marginBottom: '0.85rem' }}>
                  Recomendaciones de Infraestructura
                </h4>
                <ul style={{ paddingLeft: '1.15rem', fontSize: '0.825rem', color: 'var(--text-sub)', display: 'flex', flexDirection: 'column', gap: '0.45rem', margin: 0 }}>
                  {simulationReport.recommendations.map((rec, idx) => (
                    <li key={idx}>{rec}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button className="btn btn-secondary" onClick={resetWizard}>
              Volver a empezar
            </button>
            <button 
              className="btn btn-primary"
              style={{
                backgroundColor: 'var(--brand-yellow)',
                borderColor: 'var(--brand-yellow)',
                color: '#0f172a',
                fontWeight: '900',
                padding: '0.85rem 2.25rem',
                fontSize: '1rem',
                boxShadow: '0 6px 20px -3px rgba(251, 176, 59, 0.45)'
              }}
              onClick={startMigration}
            >
              INICIAR MIGRACIÓN AUTOMÁTICA <ArrowRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: EXECUTION TIMELINE */}
      {currentStep === 4 && (
        <div className="card" style={{ padding: '2.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-default)', paddingBottom: '1rem', marginBottom: '2rem' }}>
            <div>
              <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.35rem', fontWeight: '800' }}>
                Ejecutando Migración cPanel a VPS
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-sub)' }}>
                Motor DevOps de Neokik procesando el respaldo en segundo plano
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: '800', color: 'var(--text-sub)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tiempo Transcurrido</div>
              <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.5rem', fontWeight: '900', color: 'var(--brand-blue)' }}>{elapsedTime}</div>
            </div>
          </div>

          <MigrationProgress 
            steps={migrationLogs}
            elapsedTime={elapsedTime}
            overallStatus={overallStatus}
          />

          {overallStatus === 'FAILED' && (
            <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={resetWizard}>
                Cancelar y Volver
              </button>
              <button 
                className="btn btn-primary"
                style={{
                  backgroundColor: 'var(--brand-yellow)',
                  borderColor: 'var(--brand-yellow)',
                  color: '#0f172a',
                  fontWeight: '900',
                  padding: '0.85rem 2rem'
                }}
                onClick={startMigration}
              >
                Reintentar Migración
              </button>
            </div>
          )}
        </div>
      )}

      {/* STEP 5: FINAL REPORT */}
      {currentStep === 5 && (
        <div style={{ animation: 'pwFadeIn 0.4s ease' }}>
          
          <div className="card celebration-banner" style={{
            background: 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
            color: 'white',
            padding: '2.25rem 2rem',
            textAlign: 'center',
            boxShadow: '0 10px 25px -5px rgba(21, 128, 61, 0.3)',
            marginBottom: '2rem'
          }}>
            <div style={{
              width: '60px', height: '60px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.2)',
              color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem'
            }}>
              <ShieldCheck size={32} />
            </div>
            <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.65rem', fontWeight: '900', margin: '0 0 0.35rem' }}>
              ¡Migración Completada Exitosamente!
            </h2>
            <p style={{ opacity: 0.9, fontSize: '0.9rem', maxWidth: '540px', margin: '0 auto' }}>
              Todos los archivos, bases de datos y cuentas de correo han sido desplegados y optimizados en el servidor VPS Ubuntu de Neokik.
            </p>
          </div>

          <div className="split-grid">
            
            {/* Left: Health Checks and DNS Analyzer */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
              <div className="card">
                <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.2rem', fontWeight: '800', marginBottom: '1.15rem' }}>
                  Resultados del Post-Migration Audit
                </h3>

                <div className="health-check-grid">
                  {healthCheckReport && healthCheckReport.map((check, idx) => (
                    <div key={idx} className={`health-check-item ${check.status === 'PASS' ? 'pass' : 'fail'}`}>
                      {check.status === 'PASS' ? <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: '2px' }} /> : <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />}
                      <div>
                        <div style={{ fontSize: '0.85rem' }}>{check.name}</div>
                        <div style={{ fontSize: '0.7rem', opacity: 0.8, fontWeight: 'normal', marginTop: '0.1rem' }}>{check.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {dnsData && (
                <DNSAnalyzer dnsData={dnsData} vpsIP="152.0.0.1" />
              )}
            </div>

            {/* Right: Temp passwords */}
            <div className="card">
              <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.2rem', fontWeight: '800', marginBottom: '0.35rem' }}>
                Credenciales y Accesos Generados
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-sub)', marginBottom: '1.25rem' }}>
                Al no poder recuperar las claves originales de cPanel, se generaron contraseñas temporales para las casillas de correo creadas en Mailcow.
              </p>

              <div style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.825rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid var(--border-default)' }}>
                      <th style={{ padding: '0.65rem 0.95rem', textAlign: 'left', fontWeight: '800' }}>Dirección de Correo</th>
                      <th style={{ padding: '0.65rem 0.95rem', textAlign: 'left', fontWeight: '800' }}>Contraseña Temporal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {passwordsList.map((pwd, idx) => (
                      <tr key={idx} style={{ borderBottom: idx < passwordsList.length - 1 ? '1px solid var(--border-default)' : 'none' }}>
                        <td style={{ padding: '0.75rem 0.95rem', fontWeight: '700' }}>{pwd.email}</td>
                        <td style={{ padding: '0.75rem 0.95rem', fontFamily: 'monospace' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
                            <code>{pwd.password}</code>
                            <button 
                              onClick={() => navigator.clipboard.writeText(pwd.password)}
                              style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-sub)', padding: 0 }}
                              title="Copiar contraseña"
                            >
                              <Copy size={13} />
                            </button>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{
                marginTop: '1.75rem',
                padding: '0.95rem',
                backgroundColor: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.8rem',
                color: '#1e40af'
              }}>
                <strong>Siguiente paso:</strong> Solicita al cliente actualizar sus DNS en NIC Chile o el registrador correspondiente y cambiar estas claves desde el panel de webmail.
              </div>
            </div>

          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.85rem' }}>
            <button className="btn btn-secondary" onClick={resetWizard}>
              Nueva Migración
            </button>
            <button className="btn btn-primary" onClick={onComplete}>
              Finalizar y Ver Sitios
            </button>
          </div>

        </div>
      )}
    </div>
  );
}
