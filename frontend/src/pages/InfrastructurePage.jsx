import React, { useState } from 'react';
import { HardDrive, Rocket, ArrowRightLeft, Server, Archive } from 'lucide-react';
import ProvisioningWizard from '../components/ProvisioningWizard';
import MigrationWizard from '../components/MigrationWizard';
import InfraClientPanel from '../components/InfraClientPanel';
import BackupManager from '../components/BackupManager';

export default function InfrastructurePage({ token, clients }) {
  const [activeTab, setActiveTab] = useState('provision');

  const activeCount = clients.filter(c => c.status === 'ACTIVE').length;
  const suspendedCount = clients.filter(c => c.status === 'SUSPENDED').length;

  return (
    <div>
      {/* Top Header */}
      <div className="top-header">
        <div className="page-title">
          <h1>Motor de Infraestructura y Migración</h1>
          <p>Provisiona nuevos clientes, migra desde cPanel y gestiona la infraestructura de cada sitio web</p>
        </div>
      </div>

      {/* Hero Banner */}
      <div
        className="card"
        style={{
          background: 'linear-gradient(135deg, #284999 0%, #1e3675 100%)',
          color: 'white',
          padding: '2rem 2.25rem',
          marginBottom: '1.75rem',
          boxShadow: '0 15px 35px -5px rgba(40, 73, 153, 0.4)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1.5rem',
        }}
      >
        <div>
          <div style={{ textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '800', letterSpacing: '1.2px', color: '#fbb03b' }}>
            ● Motor de Automatización DevOps
          </div>
          <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.75rem', fontWeight: '800', margin: '0.25rem 0' }}>
            Migración Inteligente desde cPanel
          </h2>
          <p style={{ opacity: 0.9, fontSize: '0.925rem', maxWidth: '600px' }}>
            Sube un backup completo de cPanel y el sistema detecta, configura y despliega automáticamente. Sin intervención manual.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <div style={{
            backgroundColor: 'rgba(255,255,255,0.15)',
            backdropFilter: 'blur(8px)',
            borderRadius: 'var(--radius-md)',
            padding: '0.85rem 1.25rem',
            textAlign: 'center',
            border: '1px solid rgba(255,255,255,0.2)',
          }}>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.65rem', fontWeight: '900', lineHeight: 1 }}>
              {clients.length}
            </div>
            <div style={{ fontSize: '0.72rem', fontWeight: '700', opacity: 0.85, marginTop: '0.2rem' }}>
              Proyectos Totales
            </div>
          </div>
          <div style={{
            backgroundColor: 'rgba(255,255,255,0.15)',
            backdropFilter: 'blur(8px)',
            borderRadius: 'var(--radius-md)',
            padding: '0.85rem 1.25rem',
            textAlign: 'center',
            border: '1px solid rgba(255,255,255,0.2)',
          }}>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.65rem', fontWeight: '900', lineHeight: 1 }}>
              {activeCount}
            </div>
            <div style={{ fontSize: '0.72rem', fontWeight: '700', opacity: 0.85, marginTop: '0.2rem' }}>
              Sitios Activos
            </div>
          </div>
          <div style={{
            backgroundColor: 'rgba(255,255,255,0.15)',
            backdropFilter: 'blur(8px)',
            borderRadius: 'var(--radius-md)',
            padding: '0.85rem 1.25rem',
            textAlign: 'center',
            border: '1px solid rgba(255,255,255,0.2)',
          }}>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.65rem', fontWeight: '900', lineHeight: 1 }}>
              {suspendedCount}
            </div>
            <div style={{ fontSize: '0.72rem', fontWeight: '700', opacity: 0.85, marginTop: '0.2rem' }}>
              Sitios Suspendidos
            </div>
          </div>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem', borderBottom: '1px solid var(--border-default)', paddingBottom: '0.75rem' }}>
        {[
          { id: 'provision', label: 'Nuevo Cliente', icon: Rocket },
          { id: 'migration', label: 'Asistente de Migración', icon: ArrowRightLeft },
          { id: 'management', label: 'Panel de Infraestructura', icon: Server },
          { id: 'backups', label: 'Copias de Seguridad', icon: Archive },
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

      {/* Tab Content */}
      {activeTab === 'provision' && (
        <ProvisioningWizard token={token} clients={clients} />
      )}

      {activeTab === 'migration' && (
        <MigrationWizard token={token} clients={clients} onComplete={() => setActiveTab('management')} />
      )}

      {activeTab === 'management' && (
        <InfraClientPanel token={token} clients={clients} />
      )}

      {activeTab === 'backups' && (
        <BackupManager token={token} clients={clients} />
      )}
    </div>
  );
}
