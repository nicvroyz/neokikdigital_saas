import React, { useState, useEffect } from 'react';
import { X, RefreshCw, DollarSign, CheckCircle2, CreditCard } from 'lucide-react';
import CustomSelect from './CustomSelect';

export default function RenewModal({ isOpen, onClose, onConfirm, client }) {
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('MANUAL_TRANSFER');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (client) {
      setAmount(client.amount_per_period || '');
    }
  }, [client]);

  if (!isOpen || !client) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onConfirm(client.id, {
      amount: parseFloat(amount),
      payment_method: paymentMethod,
      notes: notes,
    });
  };

  const paymentOptions = [
    { value: 'MANUAL_TRANSFER', label: 'Transferencia Bancaria Electrónica' },
    { value: 'STRIPE', label: 'Tarjeta de Crédito / Débito (Stripe)' },
    { value: 'CASH', label: 'Efectivo / Cheque' },
    { value: 'PAYPAL', label: 'PayPal' },
  ];

  const formatCLP = (val) => {
    if (!val && val !== 0) return '$0 CLP';
    return `$${Math.round(Number(val)).toLocaleString('es-CL')} CLP`;
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <RefreshCw size={20} color="var(--brand-primary)" />
            Renovar Suscripción: {client.name}
          </h2>
          <button className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem' }} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div style={{ backgroundColor: '#eff6ff', padding: '1rem', borderRadius: 'var(--radius-md)', marginBottom: '1.25rem', border: '1px solid #bfdbfe' }}>
              <div style={{ fontWeight: '700', color: 'var(--brand-primary)', marginBottom: '0.25rem' }}>
                Dominio: {client.domain} (Plan: {client.plan_interval})
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Estado Actual: <strong>{client.status === 'ACTIVE' ? 'ACTIVO' : client.status === 'EXPIRED' ? 'VENCIDO' : 'SUSPENDIDO'}</strong> | Vencimiento: {new Date(client.expiration_date).toLocaleDateString('es-CL')}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Monto de Pago Recibido ($ CLP) *</label>
              <div style={{ position: 'relative' }}>
                <DollarSign size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="number"
                  className="form-input"
                  style={{ paddingLeft: '2.25rem' }}
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Método de Pago</label>
              <CustomSelect
                options={paymentOptions}
                value={paymentMethod}
                onChange={(val) => setPaymentMethod(val.target.value)}
                icon={CreditCard}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Notas o N° de Referencia de Transacción</label>
              <textarea
                className="form-textarea"
                rows={3}
                placeholder="Ej. Transferencia Banco Estado Ref #982312 - Pago mensualidad"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.5rem' }}>
              <CheckCircle2 size={14} color="#059669" />
              Al registrar el pago de <strong>{formatCLP(amount || 0)}</strong>, el estado cambiará a <strong>ACTIVO</strong> y se actualizará la fecha de vencimiento.
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-success">
              <CheckCircle2 size={16} /> Registrar Pago y Reactivar Sitio
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
