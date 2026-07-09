import React, { useState, useEffect } from 'react';
import { Archive, Download, RotateCcw, Trash2, Search, HardDrive, AlertTriangle, Upload } from 'lucide-react';
import CustomSelect from './CustomSelect';

export default function BackupManager({ token, clients = [] }) {
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [restoreConfirm, setRestoreConfirm] = useState(null);

  const fetchBackups = async () => {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const res = await fetch('/api/infrastructure/backups', { headers });
      if (res.ok) {
        setBackups(await res.json());
      }
    } catch (err) {
      console.error('Error al obtener respaldos:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBackups();
  }, [token]);

  const handleDownload = async (backup) => {
    try {
      const res = await fetch(`/api/infrastructure/backups/${backup.id}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `backup_${backup.domain}_${backup.version}.tar.gz`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Error al descargar respaldo:', err);
    }
  };

  const handleRestore = async (backup) => {
    setRestoreConfirm(null);
    try {
      const res = await fetch(`/api/infrastructure/backups/${backup.id}/restore`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        fetchBackups();
      }
    } catch (err) {
      console.error('Error al restaurar respaldo:', err);
    }
  };

  const handleDelete = async (backup) => {
    setDeleteConfirm(null);
    try {
      const res = await fetch(`/api/infrastructure/backups/${backup.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setBackups(prev => prev.filter(b => b.id !== backup.id));
      }
    } catch (err) {
      console.error('Error al eliminar respaldo:', err);
    }
  };

  const formatSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0)} ${units[i]}`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('es-CL', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const getTypeBadge = (type) => {
    const typeMap = {
      'cpanel_full': { label: 'cPanel Completo', bg: '#dbeafe', color: '#1e40af' },
      'website_zip': { label: 'Sitio Web ZIP', bg: '#d1fae5', color: '#047857' },
      'database_sql': { label: 'Base de Datos SQL', bg: '#fce7f3', color: '#be185d' },
      'mail_backup': { label: 'Correo Electrónico', bg: '#fef3c7', color: '#b45309' },
      'full_snapshot': { label: 'Snapshot Completo', bg: '#e0e7ff', color: '#3730a3' },
    };
    const cfg = typeMap[type] || { label: type || 'Desconocido', bg: '#f1f5f9', color: '#475569' };
    return (
      <span style={{
        fontSize: '0.72rem', fontWeight: '800', padding: '0.2rem 0.6rem',
        borderRadius: '9999px', backgroundColor: cfg.bg, color: cfg.color,
        whiteSpace: 'nowrap',
      }}>
        {cfg.label}
      </span>
    );
  };

  const getInitials = (name) => {
    if (!name) return '??';
    return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  };

  const clientFilterOptions = [
    { value: 'ALL', label: 'Todos los Clientes' },
    ...clients.map(c => ({ value: c.id, label: `${c.name} (${c.domain})` })),
  ];

  const filteredBackups = filter === 'ALL' ? backups : backups.filter(b => b.client_id === filter);

  return (
    <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {/* Filter Row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ width: '320px' }}>
          <CustomSelect
            options={clientFilterOptions}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            icon={Search}
            placeholder="Filtrar por cliente..."
          />
        </div>
        <span style={{ fontSize: '0.82rem', fontWeight: '700', color: 'var(--text-muted, #94a3b8)' }}>
          {filteredBackups.length} respaldo{filteredBackups.length !== 1 ? 's' : ''} encontrado{filteredBackups.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Loading */}
      {loading && (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{
            width: '36px', height: '36px', border: '3px solid #e2e8f0',
            borderTopColor: '#284999', borderRadius: '50%',
            animation: 'spin 1s linear infinite', margin: '0 auto 0.75rem',
          }} />
          <p style={{ color: 'var(--text-muted, #94a3b8)', fontWeight: '600' }}>Cargando respaldos...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredBackups.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
          <Upload size={48} color="#cbd5e1" style={{ marginBottom: '1rem' }} />
          <h3 style={{
            fontFamily: "'Outfit', sans-serif", fontWeight: '800', fontSize: '1.15rem',
            color: 'var(--text-sub, #475569)', marginBottom: '0.4rem',
          }}>
            No se han encontrado copias de seguridad
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted, #94a3b8)' }}>
            Los respaldos aparecerán aquí una vez que se realicen migraciones o copias de seguridad programadas.
          </p>
        </div>
      )}

      {/* Table */}
      {!loading && filteredBackups.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#284999' }}>
                  <th style={thStyle}>Cliente</th>
                  <th style={thStyle}>Dominio</th>
                  <th style={thStyle}>Tipo</th>
                  <th style={thStyle}>Tamaño</th>
                  <th style={thStyle}>Versión</th>
                  <th style={thStyle}>Fecha</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredBackups.map((backup, i) => (
                  <tr key={backup.id || i} style={{
                    borderBottom: '1px solid #f1f5f9',
                    backgroundColor: i % 2 === 0 ? '#ffffff' : '#f8fafc',
                    transition: 'background-color 0.15s ease',
                  }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0f4ff'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = i % 2 === 0 ? '#ffffff' : '#f8fafc'}
                  >
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <div style={{
                          width: '32px', height: '32px', borderRadius: '50%',
                          backgroundColor: '#284999', color: '#ffffff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '0.68rem', fontWeight: '800', flexShrink: 0,
                        }}>
                          {getInitials(backup.client_name)}
                        </div>
                        <span style={{ fontWeight: '700', color: 'var(--text-main, #0f172a)' }}>
                          {backup.client_name || 'Sin nombre'}
                        </span>
                      </div>
                    </td>
                    <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem', color: '#284999', fontWeight: '700' }}>
                      {backup.domain || '—'}
                    </td>
                    <td style={tdStyle}>{getTypeBadge(backup.type)}</td>
                    <td style={{ ...tdStyle, fontWeight: '700' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <HardDrive size={14} color="#94a3b8" />
                        {formatSize(backup.size)}
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <span style={{
                        fontSize: '0.75rem', fontWeight: '800', padding: '0.2rem 0.55rem',
                        borderRadius: '9999px', backgroundColor: '#eef2ff', color: '#284999',
                      }}>
                        v{backup.version || 1}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, fontSize: '0.8rem', color: 'var(--text-sub, #475569)' }}>
                      {formatDate(backup.created_at)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
                        <button
                          onClick={() => handleDownload(backup)}
                          style={actionBtnStyle}
                          title="Descargar respaldo"
                        >
                          <Download size={15} color="#284999" />
                        </button>
                        <button
                          onClick={() => setRestoreConfirm(backup)}
                          style={actionBtnStyle}
                          title="Restaurar respaldo"
                        >
                          <RotateCcw size={15} color="#f59e0b" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(backup)}
                          style={actionBtnStyle}
                          title="Eliminar respaldo"
                        >
                          <Trash2 size={15} color="#dc2626" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
            <div style={{ textAlign: 'center', padding: '1.5rem' }}>
              <AlertTriangle size={40} color="#dc2626" style={{ marginBottom: '0.75rem' }} />
              <h3 style={{
                fontFamily: "'Outfit', sans-serif", fontWeight: '800', fontSize: '1.15rem',
                color: 'var(--text-main, #0f172a)', marginBottom: '0.65rem',
              }}>
                ¿Eliminar este respaldo?
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-sub, #475569)', marginBottom: '1.5rem', lineHeight: '1.5' }}>
                Se eliminará permanentemente el respaldo de <strong>{deleteConfirm.client_name}</strong> ({deleteConfirm.domain}) versión v{deleteConfirm.version || 1}. Esta acción no se puede deshacer.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                <button className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>
                  Cancelar
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => handleDelete(deleteConfirm)}
                  style={{ backgroundColor: '#dc2626', border: 'none' }}
                >
                  <Trash2 size={16} /> Eliminar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Restore Confirmation Modal */}
      {restoreConfirm && (
        <div className="modal-overlay" onClick={() => setRestoreConfirm(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
            <div style={{ textAlign: 'center', padding: '1.5rem' }}>
              <RotateCcw size={40} color="#f59e0b" style={{ marginBottom: '0.75rem' }} />
              <h3 style={{
                fontFamily: "'Outfit', sans-serif", fontWeight: '800', fontSize: '1.15rem',
                color: 'var(--text-main, #0f172a)', marginBottom: '0.65rem',
              }}>
                ¿Restaurar este respaldo?
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-sub, #475569)', marginBottom: '1.5rem', lineHeight: '1.5' }}>
                Se restaurará el respaldo de <strong>{restoreConfirm.client_name}</strong> ({restoreConfirm.domain}) versión v{restoreConfirm.version || 1}. Los datos actuales serán reemplazados.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                <button className="btn btn-secondary" onClick={() => setRestoreConfirm(null)}>
                  Cancelar
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => handleRestore(restoreConfirm)}
                  style={{ backgroundColor: '#f59e0b', border: 'none', color: '#0f172a' }}
                >
                  <RotateCcw size={16} /> Restaurar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const thStyle = {
  padding: '0.75rem 1rem', textAlign: 'left',
  fontWeight: '700', fontSize: '0.78rem',
  color: '#ffffff', textTransform: 'uppercase',
  letterSpacing: '0.05em', whiteSpace: 'nowrap',
};

const tdStyle = {
  padding: '0.75rem 1rem', color: 'var(--text-main, #0f172a)',
  fontWeight: '600',
};

const actionBtnStyle = {
  width: '32px', height: '32px', borderRadius: '8px',
  border: '1px solid #e2e8f0', backgroundColor: '#f8fafc',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', transition: 'all 0.15s ease', padding: 0,
};
