#!/usr/bin/env bash
# Daily ShipStack backup: database (secrets stay encrypted), uploads and logs. Keeps 7 days.
set -euo pipefail
DATA=$(grep '^SHIPSTACK_DATA=' /etc/shipstack.env 2>/dev/null | cut -d= -f2-); DATA=${DATA:-/var/lib/shipstack/data}
OUT=/var/backups/shipstack
install -d -m 700 "$OUT"
cd "$DATA"
tar -czf "$OUT/shipstack-$(date +%F).tgz" --ignore-failed-read db.json uploads logs 2>/dev/null || true
chmod 600 "$OUT"/*.tgz
find "$OUT" -name 'shipstack-*.tgz' -mtime +7 -delete
