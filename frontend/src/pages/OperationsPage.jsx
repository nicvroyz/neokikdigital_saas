import React, { useState, useEffect } from 'react';
import { Briefcase, CheckSquare, Calendar, Clock, Plus, Filter, Play, Pause, CheckCircle2, AlertCircle, Calendar as CalendarIcon, User, Layers, ArrowRight, Edit2, Trash2, Tag, AlertTriangle } from 'lucide-react';
import CustomSelect from '../components/CustomSelect';

export default function OperationsPage({ clients, token }) {
  const [activeTab, setActiveTab] = useState('kanban');
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [workLogs, setWorkLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal States
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);

  // Form States
  const [newProject, setNewProject] = useState({
    client_id: clients[0]?.id || '',
    name: '',
    description: '',
    status: 'ACTIVE',
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().split('T')[0],
  });

  const [newTask, setNewTask] = useState({
    project_id: '',
    title: '',
    description: '',
    status: 'TODO',
    priority: 'MEDIUM',
    estimated_hours: 8,
    due_date: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split('T')[0],
  });

  const [newLog, setNewLog] = useState({
    task_id: '',
    date: new Date().toISOString().split('T')[0],
    hours_spent: 2,
    notes: '',
  });

  const fetchOperationsData = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [pRes, tRes, wRes] = await Promise.all([
        fetch('/api/projects', { headers }),
        fetch('/api/tasks', { headers }),
        fetch('/api/work-logs', { headers }),
      ]);

      if (pRes.ok) {
        const pData = await pRes.json();
        setProjects(pData);
        if (pData.length > 0 && !newTask.project_id) {
          setNewTask(prev => ({ ...prev, project_id: pData[0].id }));
        }
      }
      if (tRes.ok) {
        const tData = await tRes.json();
        setTasks(tData);
        if (tData.length > 0 && !newLog.task_id) {
          setNewLog(prev => ({ ...prev, task_id: tData[0].id }));
        }
      }
      if (wRes.ok) setWorkLogs(await wRes.json());
    } catch (err) {
      console.error('Error fetching operations data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOperationsData();
  }, [token]);

  // Create Handlers
  const handleCreateProject = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(newProject),
      });
      if (res.ok) {
        setIsProjectModalOpen(false);
        setNewProject({
          client_id: clients[0]?.id || '',
          name: '',
          description: '',
          status: 'ACTIVE',
          start_date: new Date().toISOString().split('T')[0],
          end_date: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().split('T')[0],
        });
        fetchOperationsData();
      }
    } catch (err) {
      console.error('Error creating project:', err);
    }
  };

  const handleCreateTask = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(newTask),
      });
      if (res.ok) {
        setIsTaskModalOpen(false);
        setNewTask({
          project_id: projects[0]?.id || '',
          title: '',
          description: '',
          status: 'TODO',
          priority: 'MEDIUM',
          estimated_hours: 8,
          due_date: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split('T')[0],
        });
        fetchOperationsData();
      }
    } catch (err) {
      console.error('Error creating task:', err);
    }
  };

  const handleCreateLog = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/work-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(newLog),
      });
      if (res.ok) {
        setIsLogModalOpen(false);
        setNewLog({
          task_id: tasks[0]?.id || '',
          date: new Date().toISOString().split('T')[0],
          hours_spent: 2,
          notes: '',
        });
        fetchOperationsData();
      }
    } catch (err) {
      console.error('Error creating log:', err);
    }
  };

  const handleUpdateTaskStatus = async (taskId, newStatus) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) fetchOperationsData();
    } catch (err) {
      console.error('Error updating task status:', err);
    }
  };

  const getPriorityBadge = (priority) => {
    switch (priority) {
      case 'HIGH':
        return <span style={{ fontSize: '0.72rem', fontWeight: '800', padding: '0.2rem 0.55rem', borderRadius: '9999px', backgroundColor: '#ffe4e6', color: '#be123c' }}>ALTA</span>;
      case 'MEDIUM':
        return <span style={{ fontSize: '0.72rem', fontWeight: '800', padding: '0.2rem 0.55rem', borderRadius: '9999px', backgroundColor: '#fef3c7', color: '#b45309' }}>MEDIA</span>;
      default:
        return <span style={{ fontSize: '0.72rem', fontWeight: '800', padding: '0.2rem 0.55rem', borderRadius: '9999px', backgroundColor: '#e0f2fe', color: '#0369a1' }}>BAJA</span>;
    }
  };

  const clientOptions = clients.map(c => ({ value: c.id, label: `${c.name} (${c.domain})` }));
  const projectOptions = projects.map(p => ({ value: p.id, label: `${p.name} (${p.client_name})` }));
  const taskOptions = tasks.map(t => ({ value: t.id, label: `${t.title} (${t.client_name})` }));

  const priorityOptions = [
    { value: 'LOW', label: 'Prioridad BAJA' },
    { value: 'MEDIUM', label: 'Prioridad MEDIA' },
    { value: 'HIGH', label: 'Prioridad ALTA' },
  ];

  return (
    <div>
      {/* Top Header */}
      <div className="top-header">
        <div className="page-title">
          <h1>Módulo de Operaciones y Desarrollo</h1>
          <p>Planificación de proyectos por cliente, tablero Kanban de tareas y registro liviano de tiempo</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn btn-secondary" onClick={() => setIsLogModalOpen(true)}>
            <Clock size={16} /> Registrar Horas
          </button>
          <button className="btn btn-secondary" onClick={() => setIsProjectModalOpen(true)}>
            <Briefcase size={16} /> Nuevo Proyecto
          </button>
          <button className="btn btn-primary" onClick={() => setIsTaskModalOpen(true)}>
            <Plus size={16} /> Nueva Tarea
          </button>
        </div>
      </div>

      {/* Operations Sub-Navigation Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem', borderBottom: '1px solid var(--border-default)', paddingBottom: '0.75rem' }}>
        {[
          { id: 'kanban', label: 'Tablero Kanban (Tareas)', icon: CheckSquare },
          { id: 'projects', label: 'Proyectos por Cliente', icon: Briefcase },
          { id: 'calendar', label: 'Calendario y Gantt Simplificado', icon: Calendar },
          { id: 'worklogs', label: 'Registro de Horas (Work Log)', icon: Clock },
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

      {/* TAB 1: KANBAN BOARD */}
      {activeTab === 'kanban' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', alignItems: 'start' }}>
          <div className="card" style={{ backgroundColor: '#f8fafc', padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', paddingBottom: '0.65rem', borderBottom: '2px solid #cbd5e1' }}>
              <div style={{ fontWeight: '800', fontFamily: 'Outfit, sans-serif', fontSize: '1.1rem', color: '#334155', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#64748b' }}></span>
                POR HACER (TODO)
              </div>
              <span className="nav-badge">{tasks.filter(t => t.status === 'TODO').length}</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {tasks.filter(t => t.status === 'TODO').map(task => (
                <div key={task.id} className="card" style={{ padding: '1.15rem', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-xs)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: '800', color: 'var(--brand-indigo)' }}>{task.client_name}</span>
                    {getPriorityBadge(task.priority)}
                  </div>
                  <div style={{ fontWeight: '800', fontSize: '0.95rem', color: 'var(--text-main)', marginBottom: '0.35rem' }}>{task.title}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-sub)', marginBottom: '0.85rem' }}>{task.description}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.65rem', borderTop: '1px solid var(--border-subtle)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    <span>⏱ {task.estimated_hours} hrs est.</span>
                    <button className="btn btn-secondary" style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }} onClick={() => handleUpdateTaskStatus(task.id, 'DOING')}>
                      Mover a En Proceso →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ backgroundColor: '#eff6ff', padding: '1.25rem', border: '1px solid #bfdbfe' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', paddingBottom: '0.65rem', borderBottom: '2px solid #3b82f6' }}>
              <div style={{ fontWeight: '800', fontFamily: 'Outfit, sans-serif', fontSize: '1.1rem', color: '#1d4ed8', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="pulse-dot" style={{ backgroundColor: '#3b82f6' }}></span>
                EN PROCESO (DOING)
              </div>
              <span className="nav-badge" style={{ backgroundColor: '#3b82f6', color: 'white' }}>{tasks.filter(t => t.status === 'DOING').length}</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {tasks.filter(t => t.status === 'DOING').map(task => (
                <div key={task.id} className="card" style={{ padding: '1.15rem', border: '1px solid #93c5fd', boxShadow: 'var(--shadow-xs)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: '800', color: 'var(--brand-indigo)' }}>{task.client_name}</span>
                    {getPriorityBadge(task.priority)}
                  </div>
                  <div style={{ fontWeight: '800', fontSize: '0.95rem', color: 'var(--text-main)', marginBottom: '0.35rem' }}>{task.title}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-sub)', marginBottom: '0.85rem' }}>{task.description}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.65rem', borderTop: '1px solid var(--border-subtle)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    <span>⏱ {task.estimated_hours} hrs est.</span>
                    <button className="btn btn-success" style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }} onClick={() => handleUpdateTaskStatus(task.id, 'DONE')}>
                      Completar ✓
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ backgroundColor: '#f0fdf4', padding: '1.25rem', border: '1px solid #bbf7d0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', paddingBottom: '0.65rem', borderBottom: '2px solid #22c55e' }}>
              <div style={{ fontWeight: '800', fontFamily: 'Outfit, sans-serif', fontSize: '1.1rem', color: '#15803d', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CheckCircle2 size={18} color="#22c55e" />
                COMPLETADO (DONE)
              </div>
              <span className="nav-badge" style={{ backgroundColor: '#22c55e', color: 'white' }}>{tasks.filter(t => t.status === 'DONE').length}</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {tasks.filter(t => t.status === 'DONE').map(task => (
                <div key={task.id} className="card" style={{ padding: '1.15rem', border: '1px solid #86efac', opacity: 0.9 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#15803d' }}>{task.client_name}</span>
                    {getPriorityBadge(task.priority)}
                  </div>
                  <div style={{ fontWeight: '800', fontSize: '0.95rem', color: 'var(--text-main)', textDecoration: 'line-through', marginBottom: '0.35rem' }}>{task.title}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-sub)' }}>{task.description}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PROJECTS */}
      {activeTab === 'projects' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {projects.map((project) => (
            <div key={project.id} className="card" style={{ padding: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: '800', color: 'var(--brand-indigo)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Cliente: {project.client_name} ({project.domain})
                  </div>
                  <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.35rem', fontWeight: '800', margin: '0.2rem 0' }}>
                    {project.name}
                  </h3>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-sub)', maxWidth: '750px' }}>{project.description}</p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                  <span style={{
                    fontSize: '0.8rem',
                    fontWeight: '800',
                    padding: '0.35rem 0.85rem',
                    borderRadius: '9999px',
                    backgroundColor: project.status === 'ACTIVE' ? '#dcfce7' : project.status === 'PAUSED' ? '#fef3c7' : '#f1f5f9',
                    color: project.status === 'ACTIVE' ? '#15803d' : project.status === 'PAUSED' ? '#b45309' : '#475569',
                  }}>
                    {project.status === 'ACTIVE' ? '● PROYECTO ACTIVO' : project.status === 'PAUSED' ? 'PAUSADO' : 'FINALIZADO'}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '2rem', padding: '0.85rem 1.15rem', backgroundColor: '#f8fafc', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', color: 'var(--text-sub)', fontWeight: '600' }}>
                <div>📅 Fecha Inicio: <strong>{new Date(project.start_date).toLocaleDateString('es-CL')}</strong></div>
                <div>🏁 Fecha Término Estimada: <strong>{project.end_date ? new Date(project.end_date).toLocaleDateString('es-CL') : 'Continuo'}</strong></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 3: CALENDAR & GANTT */}
      {activeTab === 'calendar' && (
        <div style={{ display: 'grid', gap: '2rem' }}>
          <div className="card">
            <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.25rem', fontWeight: '800', marginBottom: '1.25rem' }}>
              Línea de Tiempo de Proyectos (Gantt Simplificado)
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {projects.map(p => (
                <div key={p.id} style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', fontWeight: '800', marginBottom: '0.4rem' }}>
                    <span>{p.name} ({p.client_name})</span>
                    <span style={{ color: 'var(--text-sub)', fontSize: '0.8rem' }}>{new Date(p.start_date).toLocaleDateString('es-CL')} → {p.end_date ? new Date(p.end_date).toLocaleDateString('es-CL') : 'Continuo'}</span>
                  </div>
                  <div style={{ height: '14px', width: '100%', backgroundColor: '#e2e8f0', borderRadius: '9999px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: '65%', background: 'var(--brand-gradient)', borderRadius: '9999px' }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: WORK LOGS */}
      {activeTab === 'worklogs' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-default)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.25rem', fontWeight: '800' }}>Registro de Horas de Trabajo (Work Logs)</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-sub)' }}>Seguimiento liviano de tiempo y notas internas por tarea</p>
            </div>
            <button className="btn btn-primary" onClick={() => setIsLogModalOpen(true)}>
              <Clock size={16} /> Registrar Horas
            </button>
          </div>

          <div className="table-wrapper" style={{ border: 'none', borderRadius: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Cliente y Proyecto</th>
                  <th>Tarea Asociada</th>
                  <th>Horas Dedicadas</th>
                  <th>Notas / Avance</th>
                </tr>
              </thead>
              <tbody>
                {workLogs.map(log => (
                  <tr key={log.id}>
                    <td style={{ fontWeight: '700', fontSize: '0.85rem', color: 'var(--text-sub)' }}>
                      {new Date(log.date).toLocaleDateString('es-CL')}
                    </td>
                    <td>
                      <div style={{ fontWeight: '800', color: 'var(--text-main)' }}>{log.client_name}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--brand-indigo)' }}>{log.project_name}</div>
                    </td>
                    <td style={{ fontWeight: '700', fontSize: '0.9rem' }}>{log.task_title}</td>
                    <td>
                      <span style={{ fontWeight: '800', fontSize: '0.95rem', color: '#15803d', backgroundColor: '#dcfce7', padding: '0.2rem 0.6rem', borderRadius: '9999px' }}>
                        ⏱ {log.hours_spent} hrs
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-sub)', fontSize: '0.875rem' }}>{log.notes || 'Sin observaciones'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL 1: NUEVO PROYECTO */}
      {isProjectModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Nuevo Proyecto de Cliente</h2>
              <button className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem' }} onClick={() => setIsProjectModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateProject}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Cliente Asociado *</label>
                  <CustomSelect
                    options={clientOptions}
                    value={newProject.client_id}
                    onChange={(val) => setNewProject({ ...newProject, client_id: val.target.value })}
                    icon={User}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Nombre del Proyecto *</label>
                  <input
                    type="text"
                    className="form-input"
                    required
                    placeholder="Ej. Rediseño E-commerce y Pasarela de Pago"
                    value={newProject.name}
                    onChange={e => setNewProject({ ...newProject, name: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Descripción u Objetivos</label>
                  <textarea
                    className="form-textarea"
                    rows={3}
                    placeholder="Detalles del alcance del trabajo..."
                    value={newProject.description}
                    onChange={e => setNewProject({ ...newProject, description: e.target.value })}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Fecha de Inicio *</label>
                    <input
                      type="date"
                      className="form-input"
                      required
                      value={newProject.start_date}
                      onChange={e => setNewProject({ ...newProject, start_date: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Fecha Término Estimada</label>
                    <input
                      type="date"
                      className="form-input"
                      value={newProject.end_date}
                      onChange={e => setNewProject({ ...newProject, end_date: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsProjectModalOpen(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Crear Proyecto</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: NUEVA TAREA */}
      {isTaskModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Nueva Tarea de Desarrollo</h2>
              <button className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem' }} onClick={() => setIsTaskModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateTask}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Proyecto Pertaneciente *</label>
                  <CustomSelect
                    options={projectOptions}
                    value={newTask.project_id}
                    onChange={(val) => setNewTask({ ...newTask, project_id: val.target.value })}
                    icon={Briefcase}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Título de la Tarea *</label>
                  <input
                    type="text"
                    className="form-input"
                    required
                    placeholder="Ej. Integración API Webpay Transbank"
                    value={newTask.title}
                    onChange={e => setNewTask({ ...newTask, title: e.target.value })}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Prioridad</label>
                    <CustomSelect
                      options={priorityOptions}
                      value={newTask.priority}
                      onChange={(val) => setNewTask({ ...newTask, priority: val.target.value })}
                      icon={AlertTriangle}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Horas Estimadas</label>
                    <input
                      type="number"
                      className="form-input"
                      value={newTask.estimated_hours}
                      onChange={e => setNewTask({ ...newTask, estimated_hours: parseFloat(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Descripción</label>
                  <textarea
                    className="form-textarea"
                    rows={2}
                    value={newTask.description}
                    onChange={e => setNewTask({ ...newTask, description: e.target.value })}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsTaskModalOpen(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Crear Tarea</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: REGISTRO DE HORAS */}
      {isLogModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Registrar Horas de Trabajo</h2>
              <button className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem' }} onClick={() => setIsLogModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateLog}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Tarea Realizada *</label>
                  <CustomSelect
                    options={taskOptions}
                    value={newLog.task_id}
                    onChange={(val) => setNewLog({ ...newLog, task_id: val.target.value })}
                    icon={CheckSquare}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Fecha *</label>
                    <input
                      type="date"
                      className="form-input"
                      required
                      value={newLog.date}
                      onChange={e => setNewLog({ ...newLog, date: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Horas Dedicadas *</label>
                    <input
                      type="number"
                      step="0.5"
                      className="form-input"
                      required
                      value={newLog.hours_spent}
                      onChange={e => setNewLog({ ...newLog, hours_spent: parseFloat(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Notas / Avances</label>
                  <textarea
                    className="form-textarea"
                    rows={3}
                    placeholder="Describe el avance realizado..."
                    value={newLog.notes}
                    onChange={e => setNewLog({ ...newLog, notes: e.target.value })}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsLogModalOpen(false)}>Cancelar</button>
                <button type="submit" className="btn btn-success">Guardar Registro de Horas</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
