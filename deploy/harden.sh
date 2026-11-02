#!/usr/bin/env bash
# Server hardening for ShipStack. Safe to run again at any time.
#   sudo bash deploy/harden.sh
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Please run with sudo"; exit 1; }
HERE="$(cd "$(dirname "$0")" && pwd)"
export DEBIAN_FRONTEND=noninteractive
step() { printf '\n\033[1;33m==> %s\033[0m\n' "$*"; }

step "Packages: automatic security updates, fail2ban, unzip"
apt-get install -y -q unattended-upgrades fail2ban unzip >/dev/null
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF

step "SSH: keys only, no root login, few attempts per connection"
cat > /etc/ssh/sshd_config.d/99-shipstack.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
MaxAuthTries 3
X11Forwarding no
AllowAgentForwarding no
EOF
sshd -t
systemctl reload ssh 2>/dev/null || systemctl reload sshd

step "fail2ban: ban IPs that keep guessing SSH logins"
cat > /etc/fail2ban/jail.d/shipstack.local <<'EOF'
[sshd]
enabled  = true
maxretry = 5
findtime = 10m
bantime  = 1h
EOF
systemctl enable fail2ban >/dev/null 2>&1
systemctl restart fail2ban

step "Container isolation rules (re-applied whenever Docker starts)"
echo br_netfilter > /etc/modules-load.d/shipstack.conf
echo 'net.bridge.bridge-nf-call-iptables = 1' > /etc/sysctl.d/90-shipstack.conf
install -m 755 "$HERE/container-firewall.sh" /usr/local/sbin/shipstack-container-firewall
cat > /etc/systemd/system/shipstack-firewall.service <<'EOF'
[Unit]
Description=ShipStack container network isolation
After=docker.service
Requires=docker.service
PartOf=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/local/sbin/shipstack-container-firewall

[Install]
WantedBy=multi-user.target docker.service
EOF
systemctl daemon-reload
systemctl enable shipstack-firewall >/dev/null 2>&1
systemctl restart shipstack-firewall

step "Encryption key for secrets stored by ShipStack"
if ! grep -q '^SHIPSTACK_SECRET_KEY=' /etc/shipstack.env; then
  echo "SHIPSTACK_SECRET_KEY=$(openssl rand -hex 32)" >> /etc/shipstack.env
  echo "Generated a new key in /etc/shipstack.env – keep a private copy of this file."
fi
chown root:root /etc/shipstack.env
chmod 600 /etc/shipstack.env

step "File permissions"
DATA=$(grep '^SHIPSTACK_DATA=' /etc/shipstack.env | cut -d= -f2-); DATA=${DATA:-/var/lib/shipstack/data}
chown -R shipstack:shipstack "$(dirname "$DATA")"
chmod 700 "$DATA"
[ -f "$DATA/db.json" ] && chmod 600 "$DATA/db.json"
chmod 750 /var/lib/shipstack

step "Daily backups (kept 7 days in /var/backups/shipstack)"
install -m 755 "$HERE/backup.sh" /etc/cron.daily/shipstack-backup
/etc/cron.daily/shipstack-backup

echo
echo "Hardening complete. Restart ShipStack to load the encryption key: sudo systemctl restart shipstack"
