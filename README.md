# Neokik Digital - Plataforma Operativa SaaS de la Agencia

Un sistema operativo SaaS interno, simple, escalable y rentable diseñado para **Neokik Digital** para centralizar el hosting de sitios web de clientes, suscripciones de mantenimiento, ciclos de facturación recurrentes y el aprovisionamiento/migración automatizada de contenedores bajo la arquitectura segura de **Caddy + Mailcow**.

---

## 🚀 Características Clave

- **Aislamiento Seguro en Producción**: 
  - Si la base de datos PostgreSQL falla en el arranque en producción (`NODE_ENV=production`), la aplicación realiza un cierre controlado inmediato (`process.exit(1)`).
  - Si la base de datos se cae durante el tiempo de ejecución, las peticiones fallan arrojando una excepción de conexión en lugar de usar en-memoria.
- **Flujo de Suscripción Automatizado**:
  - `ACTIVE`: Funcionamiento normal de los sitios web alojados en sus respectivos contenedores Docker de forma aislada, reverse-proxied por Caddy de manera automática.
  - `EXPIRED`: Período de gracia activo (por defecto 5 días). Envío automático de notificaciones.
  - `SUSPENDED`: Período de gracia superado. Caddy sirve automáticamente una página de suspensión del servicio (`/var/www/neokik/suspended.html`).
- **Migración y Aprovisionamiento Inteligente**:
  - Migración desatendida desde cPanel (Login -> Creación -> Subida -> Análisis de Viabilidad -> Creación de DB -> Creación de Contenedor -> Caddy SSL -> Mailcow Mailboxes & Maildir sync -> Health Check).
  - Rollback transaccional ante fallos: Limpieza segura y validada de bases de datos, contenedores de Docker, directorios temporales y carpetas del host.
  - Sincronización de correos Maildir nativa en contenedores via `docker cp` y regeneración de índices IMAP en Dovecot.
- **Métricas de MRR**: Tablero con estadísticas de Ingresos Mensuales Recurrentes (MRR), clientes activos, próximos vencimientos y bitácora de pagos.
- **Protección contra Vulnerabilidades**: Bloqueo de ataques Directory Traversal (Zip Slip) en la carga y extracción de respaldos.
- **Limitación de Tasa (Rate Limiting)**: Control de tasa basado en ventanas deslizantes en memoria para proteger los endpoints críticos de autenticación y migraciones.

---

## 🛠 Stack Tecnológico

- **Backend**: Node.js, Express, TypeScript, `pg` (Cliente PostgreSQL), `node-cron`, `nodemailer`.
- **Frontend**: React 18, Vite, Lucide Icons, Vanilla CSS Design System.
- **Base de Datos**: PostgreSQL 15 (Host) + MySQL (contenedores de sitios).
- **Servicios Externos**: Caddy (Reverse Proxy central con soporte auto-SSL Let's Encrypt), Mailcow Dockerized (Servidor de correos central), Docker (Entorno de contenedores para sitios de clientes).

---

## 📁 Estructura del Proyecto

```
neokikdigital_saas/
├── backend/
│   ├── src/
│   │   ├── config/          # Conexión DB, Validador de entorno y variables
│   │   ├── controllers/     # Controladores (Auth, Client, Dashboard, Hosting, Infra)
│   │   ├── db/              # schema.sql & seed.sql
│   │   ├── middleware/      # Middlewares (Auth JWT, Rate Limiting, Multer)
│   │   ├── routes/          # Enrutadores API (Express)
│   │   └── services/        # Lógica de negocio (Client, Database, Docker, Mailcow, Migration, etc.)
│   ├── scripts/             # Scripts (initDb.js, qa_test.ts)
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/      # Componentes UI (Sidebar, Wizards de Migración/Aprovisionamiento, etc.)
│   │   ├── pages/           # Vistas (Dashboard, ClientsPage, HostingPage, LoginPage)
│   │   ├── App.jsx          # Ruteador principal y estado global
│   │   └── main.jsx
│   └── vite.config.js
├── infra/
│   └── setup-vps.sh         # Script inicial de aprovisionamiento de VPS Ubuntu
└── docker-compose.yml
```

---

## 💻 Desarrollo Local

### 1. Inicializar Base de Datos
Asegúrate de tener PostgreSQL ejecutándose localmente, luego corre el script:
```bash
cd backend
npm install
# Configura el archivo backend/.env con las variables necesarias
npm run db:init
npm run dev
```

### 2. Levantar Frontend
En otra pestaña de la terminal:
```bash
cd frontend
npm install
npm run dev
```
Abre tu navegador en [http://localhost:3000](http://localhost:3000).

**Credenciales de Acceso:** Las credenciales del administrador inicial se generan y muestran de manera segura en la consola durante el proceso de inicialización de la base de datos (`npm run db:init`).

---

## 🌐 Guías y Documentación de Producción

Toda la documentación técnica de producción se encuentra disponible en la carpeta `docs/`:

1. **[Guía de Despliegue VPS (DEPLOY.md)](file:///c:/Users/jacvr/OneDrive/Desktop/neokikdigital_saas/docs/DEPLOY.md)**: Instalación y configuración paso a paso de Node.js, PostgreSQL, Caddy, Mailcow, Docker, PM2 y cortafuegos.
2. **[Playbook de Recuperación ante Desastres (DISASTER_RECOVERY.md)](file:///c:/Users/jacvr/OneDrive/Desktop/neokikdigital_saas/docs/DISASTER_RECOVERY.md)**: Políticas de respaldos recurrentes de base de datos, procedimientos de recuperación paso a paso y checklists de monitoreo.
3. **[Política de Recuperación de Migraciones (RESUME_VS_ROLLBACK.md)](file:///c:/Users/jacvr/OneDrive/Desktop/neokikdigital_saas/docs/RESUME_VS_ROLLBACK.md)**: Detalle del comportamiento de recuperación transaccional y rollback automático implementado ante caídas del servidor o interrupciones.

---

## 🧪 Ejecución de Auditoría de QA y Pruebas E2E

Para ejecutar la suite completa de 21 comprobaciones del sistema (validador de entorno, Zip Slip, límite de tasa, health check, fallos MySQL con rollback, archivos corruptos y crash recovery de servidor):
```bash
cd backend
npm run test:qa
```
