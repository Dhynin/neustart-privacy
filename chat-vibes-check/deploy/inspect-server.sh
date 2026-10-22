#!/usr/bin/env bash
# Nur lesend: zeigt, was auf dem Server schon läuft, bevor deployt wird.
set -u
echo "== Docker";        docker --version; docker compose version 2>/dev/null
echo "== Container";     docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}'
echo "== Ports 80/443/3000"; (ss -ltnp 2>/dev/null || netstat -ltnp 2>/dev/null) | grep -E ':(80|443|3000)\b' || echo "frei"
echo "== Reverse Proxys"
for p in nginx caddy traefik apache2 httpd; do command -v "$p" >/dev/null && echo "installiert: $p"; done
systemctl is-active nginx caddy apache2 2>/dev/null | paste -sd' ' -
echo "== Bekannte ums-photo.de-Hosts in Configs"
grep -rhoE '[a-z0-9.-]*ums-photo\.de' /etc/nginx /etc/caddy /etc/traefik 2>/dev/null | sort -u
echo "== DNS chat.ums-photo.de"; getent hosts chat.ums-photo.de || echo "kein Eintrag"
echo "== Öffentliche IP"; curl -s https://api.ipify.org; echo
