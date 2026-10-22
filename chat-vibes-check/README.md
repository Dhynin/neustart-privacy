# Chat Vibes Check

Mobile-first Webapp: Nutzer:innen laden einen exportierten WhatsApp-Chat (`.txt`) hoch, die Persona
(Standard: „Frieda“) kommentiert Ton, Tempo und Balance und vergibt einen spielerischen Vibe-Score.

Persona umbenennen oder umstylen: nur `persona.config.ts` ändern.

## Datenfluss

1. Der Browser liest die Datei mit `File.text()` und parst sie (`lib/whatsapp.ts`). Die Rohdatei wird nie hochgeladen.
2. Der Browser berechnet Statistiken und eine Stichprobe (max. 200 Nachrichten à 300 Zeichen: Anfang, Ende, zufällige Mitte) und entfernt E-Mails, Telefonnummern und Links (`lib/prepare.ts`).
3. Nur dieses Objekt geht per `POST /api/analyze`. Der Server prüft es mit zod (`lib/schema.ts`) und ruft Claude mit `messages.parse()` + `zodOutputFormat()` auf (`lib/analyze.ts`).
4. Keine Datenbank, keine Speicherung, keine Chat-Inhalte in Logs. Pro IP gibt es ein einfaches Rate-Limit (`lib/rate-limit.ts`).

Unterstützt: Android- und iOS-Exporte, englische (`6/5/23, 9:15 PM`) und deutsche (`05.06.23, 21:15`) Formate.
Nicht unterstützt: iMessage, Instagram, Messenger.

## Lokal

```bash
npm install
npm test          # Parser-, Sampling- und Scrub-Tests
cp .env.example .env.local   # ANTHROPIC_API_KEY eintragen
npm run dev
```

Modell: `claude-opus-4-8`, überschreibbar mit `ANTHROPIC_MODEL`.

## Deployment auf dem Server (chat.ums-photo.de)

```bash
# 1. Repo auf den Server holen und ins Verzeichnis wechseln
cd chat-vibes-check

# 2. Nur lesend nachsehen, was schon läuft (Container, Ports 80/443, nginx/Caddy/Traefik)
./deploy/inspect-server.sh

# 3. Secret anlegen (wird nicht ins Image gebacken und nicht committet)
cp .env.example .env && chmod 600 .env && nano .env

# 4a. Kein Reverse Proxy vorhanden → App + Caddy (holt Let's-Encrypt-Zertifikat selbst)
docker compose up -d --build

# 4b. nginx/Caddy läuft schon → nur die App starten und dort einhängen
docker compose up -d --build app
#    nginx:  deploy/nginx-chat.ums-photo.de.conf + certbot --nginx -d chat.ums-photo.de
#    Caddy:  deploy/Caddyfile.snippet in die bestehende Caddyfile übernehmen, dann reload

# 5. Prüfen
curl -s http://127.0.0.1:3000/api/health
curl -I https://chat.ums-photo.de
```

Danach im Browser auf dem Handy einen Test-Export hochladen, zum Beispiel `fixtures/beispiel-chat-android-de.txt`.
In den DevTools (Netzwerk) sieht man, dass nur das JSON mit `totals`, `participants` und `sample` gesendet wird.
