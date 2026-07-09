# Production Deployment Guide — Neokik Digital SaaS (Docker Compose)

This guide outlines the steps required to deploy the Neokik Digital SaaS platform in production on an Ubuntu VPS using **Docker Compose** and **Caddy** (with no Nginx or PM2 dependencies).

---

## Prerequisites

Ensure the following packages are installed on your VPS:

| Component | Minimum Version | Purpose |
|---|---|---|
| Ubuntu Server | 22.04 LTS | Host Operating System |
| Docker | 24.x | Container Runtime |
| Docker Compose | v2.x | Multi-container Orchestration |

### 1. Install Docker & Compose on Ubuntu

If Docker is not yet installed on your VPS:
```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://get.docker.com | bash
sudo usermod -aG docker $USER
```

---

## 2. Directory Layout & Setup

Clone or upload the repository to your VPS, for example at `/opt/neokikdigital_saas`:
```bash
sudo mkdir -p /opt/neokikdigital_saas
sudo chown -R $USER:$USER /opt/neokikdigital_saas
cd /opt/neokikdigital_saas
```

---

## 3. Environment Variables Configuration

1. Create a `.env` file in the root directory (matching the `.env.example` structure):
   ```bash
   cp .env.example .env
   ```
2. Open `.env` and configure the following variables:
   ```env
   # Database (auto-configured in PostgreSQL container)
   DB_USER=neokik_admin
   DB_PASSWORD=generate_a_secure_password_here
   DB_NAME=neokik_saas

   # Security
   # Generate a unique secret with: openssl rand -hex 32
   JWT_SECRET=your_unique_secure_jwt_secret
   ```

---

## 4. Deploying Containers

Build and start the application stack in detached mode:
```bash
docker compose up --build -d
```

This command will:
1. Initialize the PostgreSQL database container (`neokik-db`).
2. Build and launch the Node.js/TypeScript backend API container (`neokik-api`), waiting until PostgreSQL is fully healthy.
3. Build and launch the Caddy-based React frontend container (`neokik-frontend`).
4. Launch the Caddy proxy gateway container (`neokik-caddy`) exposing ports `80` and `443` to the internet.

---

## 5. Database Initialization

Once the containers are running, initialize the database schema and seed config inside the running backend container:
```bash
docker compose exec backend npm run db:init
```

> [!IMPORTANT]
> The database initialization script (`npm run db:init`) will dynamically generate and display a secure random password for the initial administrator user (`admin@neokikdigital.com`). **Save this password securely.**

---

## 6. Service Verification & Logs

### Check Container Status
Verify that all 4 containers are running and healthy:
```bash
docker compose ps
```

### Inspect Logs
To inspect logs in real time:
```bash
# View all logs
docker compose logs -f

# View backend logs only
docker compose logs -f backend

# View proxy gateway logs only
docker compose logs -f caddy
```

### Test API Health
Execute a curl check to verify that the public health check endpoint is reachable via Caddy proxy:
```bash
curl http://localhost/api/health
```

Expected response:
```json
{
  "status": "healthy"
}
```

---

## 7. Configuring Domain & SSL (Let's Encrypt)

By default, Caddy is configured to serve requests on the VPS public IP (`:80`). To bind a domain (e.g. `jacvroyz.cl`) and enable automatic SSL certificates:

1. Edit the Caddyfile config file at `infra/caddy/Caddyfile`:
   ```caddy
   # Comment out the IP block
   # :80 {
   #     reverse_proxy /api/* backend:5000
   #     reverse_proxy frontend:80
   # }

   # Un-comment and set your production domain name
   jacvroyz.cl {
       reverse_proxy /api/* backend:5000
       reverse_proxy frontend:80
   }
   ```
2. Reload the Caddy service configuration:
   ```bash
   docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
   ```
   Caddy will automatically contact Let's Encrypt, issue, and manage SSL certificates for your domain name.
