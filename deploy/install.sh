#!/usr/bin/env bash
# One-command setup of ShipStack on a fresh Ubuntu 22.04 / 24.04 server (x86_64 or ARM).
#   sudo bash deploy/install.sh shipzo.tech [you@example.com]
# Safe to run again: it updates the code and restarts, keeping your data and settings.
set -euo pipefail

DOMAIN="${1:?usage: sudo bash deploy/install.sh yourdomain.tech you@example.com}"
EMAIL="${2:-}"   # optional: Let's Encrypt expiry notices
SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR=/opt/shipstack
DATA_DIR=/var/lib/shipstack/data
[ "$(id -u)" = 0 ] || { echo "Please run with sudo"; exit 1; }
export DEBIAN_FRONTEND=noninteractive

step() { printf '\n\033[1;33m==> %s\033[0m\n' "$*"; }

step "Swap file (lets small 1 GB servers build images)"
if ! swapon --show | grep -q '/swapfile'; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

step "Base packages"
apt-get update -y
apt-get install -y ca-certificates curl git gnupg rsync debian-keyring debian-archive-keyring apt-transport-https

step "Docker"
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh
systemctl enable --now docker

step "Node.js 20"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

step "Caddy (automatic HTTPS)"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y && apt-get install -y caddy
fi

step "Firewall: allow SSH, HTTP and HTTPS"
if command -v ufw >/dev/null && ufw status | grep -q active; then ufw allow 22/tcp; ufw allow 80/tcp; ufw allow 443/tcp; fi
# Oracle Cloud's Ubuntu images ship iptables rules that reject everything except SSH.
if iptables -S INPUT 2>/dev/null | grep -q -- '-j REJECT'; then
  for port in 443 80; do iptables -C INPUT -p tcp --dport $port -j ACCEPT 2>/dev/null || iptables -I INPUT 5 -p tcp --dport $port -j ACCEPT; done
  command -v netfilter-persistent >/dev/null && netfilter-persistent save || true
fi

step "ShipStack code → $APP_DIR"
id shipstack >/dev/null 2>&1 || useradd --system --create-home --home-dir /var/lib/shipstack --shell /usr/sbin/nologin shipstack
usermod -aG docker shipstack
mkdir -p "$APP_DIR" "$DATA_DIR"
if [ "$SRC_DIR" != "$APP_DIR" ]; then rsync -a --delete --exclude data --exclude node_modules "$SRC_DIR"/ "$APP_DIR"/; fi
chown -R shipstack:shipstack /var/lib/shipstack "$APP_DIR"

step "Settings → /etc/shipstack.env"
if [ ! -f /etc/shipstack.env ]; then
  cat > /etc/shipstack.env <<EOF
# ShipStack production settings. Edit, then: sudo systemctl restart shipstack
PORT=8080
HOST=127.0.0.1
APP_DOMAIN=$DOMAIN
SHIPSTACK_PUBLIC_URL=https://$DOMAIN
SHIPSTACK_DATA=$DATA_DIR
TRUST_PROXY=1
ALLOW_SIGNUP=true
MAX_PROJECTS_PER_USER=3
MAX_CONCURRENT_BUILDS=1
EOF
  chmod 640 /etc/shipstack.env
fi

step "System service"
cp "$APP_DIR/deploy/shipstack.service" /etc/systemd/system/shipstack.service
systemctl daemon-reload
systemctl enable shipstack >/dev/null
systemctl restart shipstack

step "HTTPS for $DOMAIN and *.$DOMAIN"
if [ -n "$EMAIL" ]; then sed -e "s/{{EMAIL}}/$EMAIL/" "$APP_DIR/deploy/Caddyfile"; else grep -v "{{EMAIL}}" "$APP_DIR/deploy/Caddyfile"; fi > /etc/caddy/Caddyfile
systemctl enable caddy >/dev/null
systemctl reload caddy || systemctl restart caddy

step "Pre-pulling base images (makes the first deploys faster)"
for img in node:20-alpine python:3.12-slim nginx:1.27-alpine; do docker pull -q "$img" || true; done

IP=$(curl -fsS -4 https://ifconfig.me || hostname -I | awk '{print $1}')
sleep 2
systemctl is-active --quiet shipstack && OK="running" || OK="NOT running – see: journalctl -u shipstack -n 50"
cat <<EOF

────────────────────────────────────────────────────────────
 ShipStack is $OK.

 Public IP of this server:  $IP

 In your domain's DNS settings, add these two records:
   Type A   Host @   Value $IP
   Type A   Host *   Value $IP

 Then open https://$DOMAIN (certificates are issued on the first visit,
 which can take ~30 seconds once DNS has updated).

 Logs:     journalctl -u shipstack -f
 Settings: /etc/shipstack.env   (then: sudo systemctl restart shipstack)
 Update:   copy the new code here and run this script again.
────────────────────────────────────────────────────────────
EOF
