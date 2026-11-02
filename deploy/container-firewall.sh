#!/usr/bin/env bash
# Network rules for user app containers. Applied by shipstack-firewall.service after Docker starts.
set -e
for i in $(seq 1 30); do iptables -nL DOCKER-USER >/dev/null 2>&1 && break; sleep 1; done

iptables -N SHIPSTACK-APPS 2>/dev/null || iptables -F SHIPSTACK-APPS
iptables -C DOCKER-USER -j SHIPSTACK-APPS 2>/dev/null || iptables -I DOCKER-USER 1 -j SHIPSTACK-APPS

iptables -A SHIPSTACK-APPS -i docker0 -o docker0 -j DROP            # apps can't reach each other
iptables -A SHIPSTACK-APPS -i docker0 -d 169.254.169.254 -j DROP    # cloud metadata service (credentials, server info)
iptables -A SHIPSTACK-APPS -i docker0 -d 168.63.129.16 -j DROP      # Azure host agent endpoint
iptables -A SHIPSTACK-APPS -i docker0 -p tcp --dport 25 -j DROP     # no outgoing spam mail
iptables -A SHIPSTACK-APPS -j RETURN

# Apps can't open SSH on the host itself
iptables -C INPUT -i docker0 -p tcp --dport 22 -j DROP 2>/dev/null || iptables -I INPUT 1 -i docker0 -p tcp --dport 22 -j DROP
echo "container firewall rules applied"
