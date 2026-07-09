import React, { useState } from 'react';
import { Lock, Mail, ArrowRight, ShieldCheck, AlertCircle } from 'lucide-react';

export default function LoginPage({ onLoginSuccess }) {
  const [email, setEmail] = useState('admin@neokikdigital.com');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Credenciales de acceso inválidas');
      }

      localStorage.setItem('neokik_token', data.token);
      localStorage.setItem('neokik_admin', JSON.stringify(data.admin));
      onLoginSuccess(data.token);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justify: 'center',
        background: 'radial-gradient(at 0% 0%, rgba(40, 73, 153, 0.15) 0px, transparent 50%), radial-gradient(at 100% 100%, rgba(245, 130, 32, 0.12) 0px, transparent 50%), #f8fafc',
        padding: '1.5rem',
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '440px',
          padding: '2.5rem',
          boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.18)',
          borderRadius: 'var(--radius-xl)',
        }}
      >
        {/* Neokik Official Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <img
            src="/logo.svg"
            alt="Neokik Digital Logo"
            style={{ width: '100%', maxWidth: '210px', height: 'auto', borderRadius: '12px', marginBottom: '1rem' }}
          />
          <p style={{ fontSize: '0.875rem', color: 'var(--text-sub)' }}>
            Acceso Administrativo al Motor SaaS y Servidores VPS
          </p>
        </div>

        {error && (
          <div
            style={{
              backgroundColor: '#ffe4e6',
              border: '1px solid #fecaca',
              color: '#be123c',
              padding: '0.85rem 1rem',
              borderRadius: 'var(--radius-md)',
              marginBottom: '1.5rem',
              fontSize: '0.85rem',
              fontWeight: '700',
              display: 'flex',
              alignItems: 'center',
              gap: '0.55rem',
            }}
          >
            <AlertCircle size={18} /> {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Correo Electrónico Administrador</label>
            <div style={{ position: 'relative' }}>
              <Mail
                size={18}
                style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
              />
              <input
                type="email"
                className="form-input"
                style={{ paddingLeft: '2.8rem' }}
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@neokikdigital.com"
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '1.75rem' }}>
            <label className="form-label">Contraseña de Acceso</label>
            <div style={{ position: 'relative' }}>
              <Lock
                size={18}
                style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
              />
              <input
                type="password"
                className="form-input"
                style={{ paddingLeft: '2.8rem' }}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', padding: '0.85rem', fontSize: '0.95rem' }}
            disabled={loading}
          >
            {loading ? 'Autenticando...' : 'Iniciar Sesión en Neokik SaaS'} <ArrowRight size={18} />
          </button>
        </form>

        <div style={{ marginTop: '2rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-subtle)', textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          <ShieldCheck size={14} style={{ display: 'inline', marginRight: '0.3rem', verticalAlign: '-2px' }} />
          Sistema Protegido JWT | Neokik Digital Chile
        </div>
      </div>
    </div>
  );
}
