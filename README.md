# Neokik Digital - Agency Operating SaaS Platform

A simple, scalable, and profitable internal SaaS operating system designed for **Neokik Digital** to centralize client web hosting, maintenance subscriptions, recurring billing cycles, and automated Nginx VPS proxy enforcement.

---

## 🚀 Key Features

- **Monolithic & Low Complexity**: Node.js/Express + TypeScript backend API + React Vite SPA frontend in clean Light Mode.
- **Automated Lifecycle Enforcement**:
  - `ACTIVE`: Normal website operation via Nginx reverse proxy.
  - `EXPIRED`: Grace period active (default 5 days), automatic email reminders dispatched.
  - `SUSPENDED`: Grace period exceeded, Nginx automatically serves branded suspension splash page (`/var/www/neokik/suspended.html`).
  - **Instant Reactivation**: Recording a payment automatically recalculates expiration dates, changes status to `ACTIVE`, and restores live site virtual host.
- **VPS Native**: Direct Nginx configuration generation and reload without heavy container overhead.
- **MRR Analytics**: Real-time stats on Monthly Recurring Revenue, active clients, upcoming expirations, and payment logs.

---

## 🛠 Tech Stack

- **Backend**: Node.js, Express, TypeScript, `pg` (PostgreSQL client), `node-cron`, `nodemailer`.
- **Frontend**: React 18, Vite, Lucide Icons, Clean Light Mode CSS Design System.
- **Database**: PostgreSQL 15.
- **Infrastructure**: Nginx Reverse Proxy, Let's Encrypt SSL, Systemd / PM2 on Ubuntu VPS.

---

## 📁 Project Structure

```
neokikdigital_saas/
├── backend/
│   ├── src/
│   │   ├── config/          # DB connection & Env vars
│   │   ├── controllers/     # Auth, Client, Dashboard, Hosting handlers
│   │   ├── db/              # schema.sql & seed.sql
│   │   ├── middleware/      # JWT authentication middleware
│   │   ├── routes/          # Express API router definitions
│   │   ├── services/        # Client logic, Hosting/Nginx sync, Cron auditor, Mailer
│   │   └── server.ts        # Express entry point
│   ├── scripts/             # initDb.js runner
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/      # Sidebar, ClientTable, ClientModal, RenewModal, StatsCard
│   │   ├── pages/           # DashboardPage, ClientsPage, SettingsPage, LoginPage
│   │   ├── styles/          # index.css (Neokik Light Mode tokens)
│   │   ├── App.jsx          # Main application router & state manager
│   │   └── main.jsx
│   └── vite.config.js
├── infra/
│   ├── nginx/               # Active & Suspended virtualhost templates & HTML splash page
│   ├── systemd/             # neokik-backend.service unit
│   └── setup-vps.sh         # Automated Ubuntu VPS setup script
└── docker-compose.yml
```

---

## 🗄 PostgreSQL Database Schema

```sql
-- Client Table snippet
CREATE TABLE clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    company_name VARCHAR(150),
    email VARCHAR(255) NOT NULL,
    domain VARCHAR(255) UNIQUE NOT NULL,
    service_type service_type NOT NULL DEFAULT 'HOSTING_AND_MAINTENANCE',
    plan_interval plan_interval NOT NULL DEFAULT 'MONTHLY',
    amount_per_period DECIMAL(10, 2) NOT NULL DEFAULT 49.99,
    status client_status NOT NULL DEFAULT 'ACTIVE',
    last_payment_date DATE NOT NULL,
    expiration_date DATE NOT NULL,
    grace_period_days INT NOT NULL DEFAULT 5,
    doc_root VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

---

## 💻 Local Development Setup

### 1. Database Setup
Ensure PostgreSQL is running locally, then initialize the schema:
```bash
cd backend
npm install
# Configure backend/.env with your Postgres credentials
npm run db:init
npm run dev
```

### 2. Frontend Setup
In a new terminal window:
```bash
cd frontend
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.
**Default Credentials:**
- Email: `admin@neokikdigital.com`
- Password: `admin123`

---

## 🌐 Ubuntu VPS Deployment Guide

1. Clone or upload this repository to your Ubuntu VPS at `/opt/neokikdigital_saas`.
2. Run the automated setup script:
   ```bash
   cd /opt/neokikdigital_saas/infra
   chmod +x setup-vps.sh
   ./setup-vps.sh
   ```
3. Issue SSL Certificate via Let's Encrypt:
   ```bash
   sudo certbot --nginx -d control.neokik.com
   ```

---

## 📈 Future Scaling Roadmap

1. **Self-Service Client Portal**: Allow clients to log in, view invoices, and pay directly via Stripe Webhooks.
2. **Automated DNS & SSL Provisioning**: Automatic Let's Encrypt SSL generation upon adding a new domain via Certbot CLI hooks.
3. **Multi-VPS Nodes**: Support expanding web hosting across multiple Ubuntu VPS instances managed by a single central Neokik API.
