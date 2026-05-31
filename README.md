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

## Tests

```bash
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
