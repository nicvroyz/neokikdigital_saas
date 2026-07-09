import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import DashboardPage from './pages/DashboardPage';
import ClientsPage from './pages/ClientsPage';
import OperationsPage from './pages/OperationsPage';
import CommunicationsPage from './pages/CommunicationsPage';
import HostingPage from './pages/HostingPage';
import InfrastructurePage from './pages/InfrastructurePage';
import SettingsPage from './pages/SettingsPage';
import LoginPage from './pages/LoginPage';
import ClientModal from './components/ClientModal';
import RenewModal from './components/RenewModal';

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('neokik_token'));
  const [activeTab, setActiveTab] = useState('dashboard');
  const [activeFilter, setActiveFilter] = useState('ALL');

  const [summary, setSummary] = useState(null);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal States
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [selectedClientForEdit, setSelectedClientForEdit] = useState(null);

  const [isRenewModalOpen, setIsRenewModalOpen] = useState(false);
  const [selectedClientForRenew, setSelectedClientForRenew] = useState(null);

  const fetchDashboardData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [sumRes, cliRes] = await Promise.all([
        fetch('/api/dashboard/summary', { headers }),
        fetch('/api/clients', { headers }),
      ]);

      if (cliRes.ok) {
        const rawClients = await cliRes.json();
        
        // Filter out specific seed data UUIDs (from legacy seed.sql) and mock memory IDs.
        // This ensures the dashboard is clean, but allows future real registration of these client domains with random UUIDs.
        const seedIds = [
          'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', // Papeles Concepción
          'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', // Rabbo Restaurant
          'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', // Boutique Imprenta
          'cli-1',
          'cli-2',
          'cli-3'
        ];
        const realClients = rawClients.filter(c => !seedIds.includes(c.id));
        setClients(realClients);

        // Recalculate stats dynamically from real database clients
        const calculatedStats = {
          total_clients: realClients.length,
          active_clients: realClients.filter(c => c.status === 'ACTIVE').length,
          expired_clients: realClients.filter(c => c.status === 'EXPIRED').length,
          suspended_clients: realClients.filter(c => c.status === 'SUSPENDED').length,
          mrr: realClients.reduce((sum, c) => {
            if (c.status === 'ACTIVE') {
              const amount = Number(c.amount_per_period || 0);
              if (c.plan_interval === 'QUARTERLY') return sum + (amount / 3);
              if (c.plan_interval === 'SEMI_ANNUAL') return sum + (amount / 6);
              if (c.plan_interval === 'ANNUAL') return sum + (amount / 12);
              return sum + amount;
            }
            return sum;
          }, 0)
        };

        if (sumRes.ok) {
          const rawSummary = await sumRes.json();
          // Filter out mock data inside summary
          const realSummary = {
            stats: calculatedStats,
            upcoming_renewals: (rawSummary.upcoming_renewals || []).filter(r => !seedIds.includes(r.id)),
            recent_payments: (rawSummary.recent_payments || []).filter(p => !seedIds.includes(p.client_id) && !seedIds.includes(p.id))
          };
          setSummary(realSummary);
        }
      }
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchDashboardData();
    }
  }, [token]);

  const handleLogout = () => {
    localStorage.removeItem('neokik_token');
    localStorage.removeItem('neokik_admin');
    setToken(null);
  };

  const handleCreateOrUpdateClient = async (formData) => {
    try {
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      };

      const url = selectedClientForEdit ? `/api/clients/${selectedClientForEdit.id}` : '/api/clients';
      const method = selectedClientForEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(`Error: ${err.error || 'Failed saving client'}`);
        return;
      }

      setIsClientModalOpen(false);
      setSelectedClientForEdit(null);
      await fetchDashboardData();
    } catch (err) {
      console.error('Save error:', err);
    }
  };

  const handleConfirmRenewal = async (clientId, renewalData) => {
    try {
      const res = await fetch(`/api/clients/${clientId}/renew`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(renewalData),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(`Renewal failed: ${err.error}`);
        return;
      }

      setIsRenewModalOpen(false);
      setSelectedClientForRenew(null);
      await fetchDashboardData();
    } catch (err) {
      console.error('Renewal error:', err);
    }
  };

  const handleDeleteClient = async (id) => {
    if (!window.confirm('Are you sure you want to delete this client? Domain configuration will be removed.')) return;
    try {
      const res = await fetch(`/api/clients/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        await fetchDashboardData();
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const handleTriggerAudit = async () => {
    try {
      const res = await fetch('/api/hosting/trigger-audit', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      await fetchDashboardData();
    } catch (err) {
      console.error('Audit error:', err);
    }
  };

  const handleSyncCaddy = async () => {
    try {
      const res = await fetch('/api/hosting/sync-caddy', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      alert(data.message || 'Caddy synced successfully');
    } catch (err) {
      console.error('Caddy sync error:', err);
    }
  };

  if (!token) {
    return <LoginPage onLoginSuccess={(t) => setToken(t)} />;
  }

  return (
    <div className="app-container">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onLogout={handleLogout}
        onTriggerAudit={handleTriggerAudit}
      />

      <main className="main-content">
        {activeTab === 'dashboard' && (
          <DashboardPage
            summary={summary}
            onAddClient={() => {
              setSelectedClientForEdit(null);
              setIsClientModalOpen(true);
            }}
            onNavigateClients={(filter) => {
              setActiveFilter(filter);
              setActiveTab('clients');
            }}
            onTriggerAudit={handleTriggerAudit}
            onSyncCaddy={handleSyncCaddy}
          />
        )}

        {activeTab === 'clients' && (
          <ClientsPage
            clients={clients}
            activeFilter={activeFilter}
            setActiveFilter={setActiveFilter}
            onAddClient={() => {
              setSelectedClientForEdit(null);
              setIsClientModalOpen(true);
            }}
            onEdit={(client) => {
              setSelectedClientForEdit(client);
              setIsClientModalOpen(true);
            }}
            onRenew={(client) => {
              setSelectedClientForRenew(client);
              setIsRenewModalOpen(true);
            }}
            onDelete={handleDeleteClient}
          />
        )}

        {activeTab === 'operations' && (
          <OperationsPage
            clients={clients}
            token={token}
          />
        )}

        {activeTab === 'communications' && (
          <CommunicationsPage
            clients={clients}
            token={token}
          />
        )}

        {activeTab === 'hosting' && (
          <HostingPage
            clients={clients}
            onSyncCaddy={handleSyncCaddy}
          />
        )}

        {activeTab === 'infrastructure' && <InfrastructurePage token={token} clients={clients} />}

        {activeTab === 'settings' && <SettingsPage />}
      </main>

      {/* Modals */}
      <ClientModal
        isOpen={isClientModalOpen}
        onClose={() => setIsClientModalOpen(false)}
        onSubmit={handleCreateOrUpdateClient}
        initialData={selectedClientForEdit}
      />

      <RenewModal
        isOpen={isRenewModalOpen}
        onClose={() => setIsRenewModalOpen(false)}
        onConfirm={handleConfirmRenewal}
        client={selectedClientForRenew}
      />
    </div>
  );
}
