#!/bin/bash

# ====================================================================
# Neokik Digital SaaS - VPS Automated Setup Script (Ubuntu Server)
# ====================================================================

set -e

echo "🚀 Starting Neokik Digital VPS Provisioning..."

# 1. System Package Updates
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git nginx postgresql postgresql-contrib certbot python3-certbot-nginx build-essential

# 2. Install Node.js 20 LTS
if ! command -v node &> /dev/null; then
    echo "📦 Installing Node.js LTS..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
fi

# 3. Setup Directories
sudo mkdir -p /var/www/neokik /opt/neokikdigital_saas
sudo cp ./nginx/suspended.html /var/www/neokik/suspended.html

# 4. Setup PostgreSQL
echo "🗄️ Configuring PostgreSQL Database..."
sudo -u postgres psql -c "CREATE USER neokik_admin WITH PASSWORD 'StrongPassword123!';" || true
sudo -u postgres psql -c "CREATE DATABASE neokik_saas OWNER neokik_admin;" || true
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE neokik_saas TO neokik_admin;" || true

# 5. Build Backend & Initialize Schema
echo "⚙️ Building Backend API..."
cd ../backend
npm install
npm run build
npm run db:init

# 6. Build Frontend SPA
echo "🎨 Building Frontend Dashboard..."
cd ../frontend
npm install
npm run build

# Copy frontend dist to web server path
sudo mkdir -p /var/www/neokik/control-panel
sudo cp -r dist/* /var/www/neokik/control-panel/

# 7. Configure Nginx for Admin Panel (control.neokik.com)
echo "🌐 Setting up Nginx Admin Panel..."
cat <<'EOF' | sudo tee /etc/nginx/sites-available/neokik-admin.conf
server {
    listen 80;
    server_name control.neokik.com;

    root /var/www/neokik/control-panel;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/neokik-admin.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# 8. Start Backend Service
echo "⚡ Starting Systemd Service..."
sudo cp ../infra/systemd/neokik-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable neokik-backend
sudo systemctl restart neokik-backend

echo "===================================================================="
echo "✅ Neokik Digital SaaS Platform successfully deployed!"
echo "   Admin Panel: http://control.neokik.com (or your VPS IP)"
echo "   Default Admin: admin@neokikdigital.com / admin123"
echo "===================================================================="
