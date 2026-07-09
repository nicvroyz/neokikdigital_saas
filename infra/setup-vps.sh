#!/bin/bash

# ====================================================================
# Neokik Digital SaaS - VPS Automated Setup Script (Ubuntu Server)
# Architecture: Caddy + Mailcow + PostgreSQL + Docker
# ====================================================================

set -e

echo "🚀 Starting Neokik Digital VPS Provisioning..."

# 1. System Package Updates
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git postgresql postgresql-contrib build-essential unzip p7zip-full

# 2. Install Node.js 20 LTS
if ! command -v node &> /dev/null; then
    echo "📦 Installing Node.js LTS..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
fi

# 3. Install Caddy
if ! command -v caddy &> /dev/null; then
    echo "🌐 Installing Caddy Reverse Proxy..."
    sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
    sudo apt update
    sudo apt install caddy -y
fi

# 4. Setup Directories
sudo mkdir -p /var/www/neokik /opt/neokikdigital_saas /etc/caddy/conf.d
sudo cp ./caddy/suspended.html /var/www/neokik/suspended.html

# 5. Setup PostgreSQL with Secure Generated Passwords
echo "🗄️ Configuring PostgreSQL Database..."
DB_PASSWORD=$(openssl rand -hex 16)
JWT_SECRET=$(openssl rand -hex 32)

sudo -u postgres psql -c "CREATE USER neokik_admin WITH PASSWORD '$DB_PASSWORD';" || true
sudo -u postgres psql -c "CREATE DATABASE neokik_saas OWNER neokik_admin;" || true
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE neokik_saas TO neokik_admin;" || true

# 6. Generate secure .env file automatically
echo "📝 Creating environment configuration file (.env)..."
cat <<EOF > ../backend/.env
NODE_ENV=production
PORT=5000

# Security
JWT_SECRET=$JWT_SECRET
JWT_EXPIRES_IN=7d

# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=neokik_admin
DB_PASSWORD=$DB_PASSWORD
DB_NAME=neokik_saas

# Platform
PLATFORM_DOMAIN=control.neokik.com

# Infrastructure
CADDY_CONFIG_DIR=/etc/caddy/conf.d
BASE_DOC_ROOT=/var/www/neokik
CADDY_DRY_RUN=false
UPLOADS_DIR=/opt/neokik/backend/uploads/migrations
MAX_UPLOAD_SIZE=17179869184
VPS_IP=\$(curl -s https://ipinfo.io/ip || echo "127.0.0.1")
EOF

# 7. Build Backend & Initialize Schema
echo "⚙️ Building Backend API..."
cd ../backend
npm install
npm run build
npm run db:init

# 8. Build Frontend SPA
echo "🎨 Building Frontend Dashboard..."
cd ../frontend
npm install
npm run build

# Copy frontend dist to web server path
sudo mkdir -p /var/www/neokik/control-panel
sudo cp -r dist/* /var/www/neokik/control-panel/

# 9. Configure Caddy for Admin Panel
echo "🌐 Setting up Caddy Configurations..."
cat <<'EOF' | sudo tee /etc/caddy/Caddyfile
# Neokik Digital Admin Panel Routing
control.neokik.com {
    root * /var/www/neokik/control-panel
    file_server
    try_files {path} /index.html
    encode gzip
}

api.control.neokik.com {
    reverse_proxy localhost:5000
}

# Import all client configuration files dynamically
import /etc/caddy/conf.d/*.caddy
EOF

sudo systemctl reload caddy

# 10. Start Backend Service
echo "⚡ Starting Systemd Service..."
sudo cp ../infra/systemd/neokik-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable neokik-backend
sudo systemctl restart neokik-backend

echo "===================================================================="
echo "✅ Neokik Digital SaaS Platform successfully deployed!"
echo "   Admin Panel: https://control.neokik.com (DNS records must resolve)"
echo "   Database Configuration generated securely in backend/.env"
echo "===================================================================="
