import React, { useState, useEffect } from 'react';
import { X, Server, Calendar, Activity } from 'lucide-react';
import CustomSelect from './CustomSelect';

export default function ClientModal({ isOpen, onClose, onSubmit, initialData }) {
  const [formData, setFormData] = useState({
    name: '',
    company_name: '',
    email: '',
    phone: '',
    domain: '',
    service_type: 'HOSTING_AND_MAINTENANCE',
    plan_interval: 'MONTHLY',
    amount_per_period: 49000,
    currency: 'CLP',
    status: 'ACTIVE',
    last_payment_date: new Date().toISOString().split('T')[0],
    expiration_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    grace_period_days: 5,
    doc_root: '',
    notes: '',
  });

  useEffect(() => {
    if (initialData) {
      setFormData({
        ...initialData,
        last_payment_date: initialData.last_payment_date ? initialData.last_payment_date.split('T')[0] : '',
        expiration_date: initialData.expiration_date ? initialData.expiration_date.split('T')[0] : '',
      });
    } else {
      setFormData({
        name: '',
        company_name: '',
        email: '',
        phone: '',
        domain: '',
        service_type: 'HOSTING_AND_MAINTENANCE',
        plan_interval: 'MONTHLY',
        amount_per_period: 49000,
        currency: 'CLP',
        status: 'ACTIVE',
        last_payment_date: new Date().toISOString().split('T')[0],
        expiration_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        grace_period_days: 5,
        doc_root: '',
        notes: '',
      });
    }
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      const updated = { ...prev, [name]: value };
      if (name === 'domain' && !initialData) {
        updated.doc_root = `/srv/neokik/sites/${value.replace(/[^a-z0-9]/gi, '_')}`;
      }
      return updated;
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const serviceOptions = [
    { value: 'HOSTING_AND_MAINTENANCE', label: 'Hosting + Mantenimiento Web' },
    { value: 'WEB_HOSTING', label: 'Hosting Web Único' },
    { value: 'MAINTENANCE', label: 'Mantenimiento Web Único' },
    { value: 'CUSTOM', label: 'Plan Personalizado' },
  ];

  const planOptions = [
    { value: 'MONTHLY', label: 'Mensual' },
    { value: 'QUARTERLY', label: 'Trimestral (Cada 3 meses)' },
    { value: 'SEMI_ANNUAL', label: 'Semestral (Cada 6 meses)' },
    { value: 'ANNUAL', label: 'Anual (Cada 12 meses)' },
  ];

  const statusOptions = [
    { value: 'ACTIVE', label: 'ACTIVO (En Línea)' },
    { value: 'EXPIRED', label: 'VENCIDO (En Gracia)' },
    { value: 'SUSPENDED', label: 'SUSPENDIDO (Pantalla Bloqueo)' },
  ];

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>{initialData ? 'Editar Sitio Web del Cliente' : 'Registrar Nuevo Sitio Web de Cliente'}</h2>
          <button className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem' }} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Nombre del Cliente *</label>
                <input
                  type="text"
                  name="name"
                  className="form-input"
                  required
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="Ej. Juan Pérez"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Nombre de la Empresa</label>
                <input
                  type="text"
                  name="company_name"
                  className="form-input"
                  value={formData.company_name || ''}
                  onChange={handleChange}
                  placeholder="Ej. Imprenta Concepción SpA"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Correo Electrónico *</label>
                <input
                  type="email"
                  name="email"
                  className="form-input"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="cliente@dominio.cl"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Teléfono de Contacto</label>
                <input
                  type="text"
                  name="phone"
                  className="form-input"
                  value={formData.phone || ''}
                  onChange={handleChange}
                  placeholder="+56 9 1234 5678"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Dominio Web (.cl / .com) *</label>
                <input
                  type="text"
                  name="domain"
                  className="form-input"
                  required
                  value={formData.domain}
                  onChange={handleChange}
                  placeholder="dominiocliente.cl"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Tipo de Servicio</label>
                <CustomSelect
                  options={serviceOptions}
                  value={formData.service_type}
                  onChange={(val) => handleChange({ target: { name: 'service_type', value: val.target.value } })}
                  icon={Server}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Plan de Suscripción</label>
                <CustomSelect
                  options={planOptions}
                  value={formData.plan_interval}
                  onChange={(val) => handleChange({ target: { name: 'plan_interval', value: val.target.value } })}
                  icon={Calendar}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Monto por Período ($ CLP)</label>
                <input
                  type="number"
                  name="amount_per_period"
                  className="form-input"
                  required
                  value={formData.amount_per_period}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Fecha del Último Pago *</label>
                <input
                  type="date"
                  name="last_payment_date"
                  className="form-input"
                  required
                  value={formData.last_payment_date}
                  onChange={handleChange}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Fecha de Próximo Vencimiento *</label>
                <input
                  type="date"
                  name="expiration_date"
                  className="form-input"
                  required
                  value={formData.expiration_date}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Estado Actual</label>
                <CustomSelect
                  options={statusOptions}
                  value={formData.status}
                  onChange={(val) => handleChange({ target: { name: 'status', value: val.target.value } })}
                  icon={Activity}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Días de Gracia</label>
                <input
                  type="number"
                  name="grace_period_days"
                  className="form-input"
                  value={formData.grace_period_days}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Ruta Directorio del Sitio (/srv/neokik/sites/)</label>
              <input
                type="text"
                name="doc_root"
                className="form-input"
                value={formData.doc_root}
                onChange={handleChange}
                placeholder="/srv/neokik/sites/dominiocliente"
              />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary">
              {initialData ? 'Guardar Cambios' : 'Registrar Sitio Web'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
