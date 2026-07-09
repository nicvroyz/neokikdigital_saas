# Production Deployment Guide — Neokik Digital SaaS v1.0

## Prerequisites

| Component       | Minimum Version | Purpose                       |
|-----------------|-----------------|-------------------------------|
| Ubuntu/Debian   | 22.04 LTS       | Operating system              |
| Node.js         | 18.x LTS        | Backend runtime               |
| PostgreSQL      | 14+             | Application database          |
| Docker + Compose| 24.x            | Container orchestration       |
| Caddy           | 2.x             | Reverse proxy + auto SSL      |
| p7zip-full      | latest          | Multithread backup extraction |
| PM2             | 5.x             | Node.js process manager       |

---

## 1. System Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18 LTS
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Install Docker
curl -fsSL https://get.docker.com | bash
sudo usermod -aG docker $USER

# Install Caddy
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy

# Install utilities
sudo apt install -y p7zip-full unzip git
npm install -g pm2
```

---

## 2. PostgreSQL Database

```bash
# Create database and user
sudo -u postgres psql <<EOF
CREATE USER neokik_admin WITH PASSWORD 'YOUR_STRONG_PASSWORD_HERE';
CREATE DATABASE neokik_saas OWNER neokik_admin;
GRANT ALL PRIVILEGES ON DATABASE neokik_saas TO neokik_admin;
EOF

# Initialize schema
cd /opt/neokik/backend
node scripts/initDb.js
```

---

## 3. Application Deployment

```bash
# Clone or upload the project
sudo mkdir -p /opt/neokik
cd /opt/neokik

# Install dependencies
cd backend && npm install --production && npx tsc
cd ../frontend && npm install && npx vite build

# Create upload directories
mkdir -p /opt/neokik/backend/uploads/migrations
chmod 755 /opt/neokik/backend/uploads
```

---

## 4. Environment Variables

Create `/opt/neokik/backend/.env`:

```env
NODE_ENV=production
PORT=5000

# Security
JWT_SECRET=generate-a-64-char-random-string-here
JWT_EXPIRES_IN=7d

# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=neokik_admin
DB_PASSWORD=YOUR_STRONG_PASSWORD_HERE
DB_NAME=neokik_saas

# Platform
PLATFORM_DOMAIN=yourdomain.cl

# Mailcow
MAILCOW_API_URL=https://mail.yourdomain.cl
MAILCOW_API_KEY=your-mailcow-api-key

# Infrastructure
NGINX_DRY_RUN=false
UPLOADS_DIR=/opt/neokik/backend/uploads/migrations
MAX_UPLOAD_SIZE=17179869184
VPS_IP=YOUR_VPS_IP
BASE_DOC_ROOT=/var/www/neokik
```

> [!CAUTION]
> Never commit the `.env` file to version control. Generate `JWT_SECRET` with: `openssl rand -hex 32`

---

## 5. PM2 Process Management

```bash
# Start backend
cd /opt/neokik/backend
pm2 start dist/server.js --name neokik-api --max-memory-restart 512M

# Save PM2 config and enable startup
pm2 save
pm2 startup
```

### Log Rotation

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
```

---

## 6. Caddy Reverse Proxy

Add to `/etc/caddy/Caddyfile`:

```
yourdomain.cl {
    root * /opt/neokik/frontend/dist
    encode gzip
    try_files {path} /index.html
    file_server
}

api.yourdomain.cl {
    reverse_proxy localhost:5000
}
```

```bash
sudo systemctl reload caddy
```

---

## 7. Firewall

```bash
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

---

## 8. Run QA Verification

```bash
cd /opt/neokik/backend
QA_ALLOW_PRODUCTION=true npm run test:qa
```

All 20 checks should pass before going live.

---

## 9. Health Check

After deployment, verify:

```bash
curl https://api.yourdomain.cl/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "database": "connected",
  "external_services": "available",
  "disk": "ok",
  "uptime": 123
}
```
