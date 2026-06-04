# Gastromania API

NestJS-API fuer Gastromania. Die Infrastruktur folgt der Eventmania-
Referenzarchitektur: Docker Compose startet die API als Production-Image,
liest Runtime-Werte aus `.env` und verbindet das Frontend ueber den
Service-Namen `gastromania-api`.

## Lokale Entwicklung

```bash
npm install
npm run start:dev
```

- API: `http://localhost:3003/api`
- Healthcheck: `http://localhost:3003/api/health`

## Umgebung

```bash
cp .env.example .env
```

Mindestens erforderlich:

```env
PORT=3003
FRONTEND_ORIGIN=http://localhost:4202,http://127.0.0.1:4202,http://localhost:8083,http://127.0.0.1:8083,https://gastromania.gastrowerk24.de
MONGODB_URI=mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/gastromania
JWT_SECRET=replace-with-a-long-random-secret
UPLOAD_DIR=/app/uploads
```

## Docker / TrueNAS

Der Stack wird aus dem Projektwurzelverzeichnis gestartet:

```bash
docker compose up -d --build
```

Compose setzt intern `PORT=3003`, mountet `./uploads:/app/uploads` und nutzt
die Werte aus `gastromania-api/.env`.

## Deployment

```bash
APP_ROOT=/mnt/downloads_pool/apps/gastromania ./deploy.sh
```

Das Script ist ein Compose-Wrapper wie bei Eventmania: `.env`-Pruefung, Pull,
Build/Start des API-Service und Smoke-Check.

## Sales-Demo-Seed

Der Sales-Demo-Seed erzeugt einen stabilen Demo-Mandanten fuer Verkauf,
Praesentation und Interessenten-Demos. Der Seed ist idempotent: vorhandene
Demo-Daten werden aktualisiert, Demo-Benutzer werden nicht doppelt angelegt.
Der oeffentliche HTTP-Endpoint bleibt durch Admin-Auth geschuetzt; fuer Server
und Wartung laufen die npm-Scripts direkt im API-App-Context.

Erzeugte Demo-Daten:

- Mandant: `GastroWerk24 Demo Restaurant`
- Standort: `GastroWerk24 Demo Restaurant Koeln`, Musterstrasse 1, 50667 Koeln
- Bereiche: Restaurantbereich, Terrasse, Lounge, Theke
- Tische: 20 Tische, gruppiert nach Restaurantbereich, Terrasse und Lounge
- Produkte: 12 Demo-Produkte aus Getraenke, Speisen und Kaffee
- Benutzer: 6 Demo-Accounts mit Standort- und Rollenzuweisung
- Dashboard-Daten: heutige Bestellungen, Reservierungen, Lagerwerte,
  Lagerbewegungen, offene Zeiteintraege und Checklisten

Demo-Logins:

| E-Mail | Passwort | Rolle |
| --- | --- | --- |
| `admin@gastromania-demo.de` | `Demo2026!` | Admin |
| `filialleiter@gastromania-demo.de` | `Demo2026!` | Filialleiter |
| `service@gastromania-demo.de` | `Demo2026!` | Service |
| `kueche@gastromania-demo.de` | `Demo2026!` | Kueche |
| `bar@gastromania-demo.de` | `Demo2026!` | Bar |
| `theke@gastromania-demo.de` | `Demo2026!` | Theke |

Lokal ausfuehren:

```bash
npm run build
npm run seed:sales-demo
npm run verify:sales-demo
npm run verify:dashboard
```

Im Docker/API-Container auf dem Server ausfuehren:

```bash
docker compose exec gastromania-api npm run seed:sales-demo
docker compose exec gastromania-api npm run verify:sales-demo
docker compose exec gastromania-api npm run verify:dashboard
```

Die Scripts verwenden keine lokalen Pfade und benoetigen im Container nur die
gebauten Dateien unter `dist` sowie die normalen Production-Dependencies. Die
Datenbank wird ueber `MONGODB_URI` aus der API-Umgebung verbunden.

## Tests

```bash
npm run build
npm test
npm run test:e2e
```

## Troubleshooting

```bash
docker compose ps
docker compose logs -f gastromania-api
curl http://localhost:3003/api/health
curl http://localhost:8083/api/health
```
