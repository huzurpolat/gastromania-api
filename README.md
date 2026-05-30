# Gastromania API

NestJS-API fuer Gastromania mit Mongoose/MongoDB, JWT-Auth und Docker-Production
Image.

## Lokale Entwicklung

```bash
npm install
npm run start:dev
```

- API: `http://localhost:3003`
- Healthcheck: `http://localhost:3003/health`

Wichtige Variablen:

```env
PORT=3003
MONGODB_URI=mongodb://localhost:27017/gastromania
JWT_SECRET=change-me
JWT_EXPIRES_IN=8h
FRONTEND_ORIGIN=http://localhost:4202,http://127.0.0.1:4202,http://localhost:8083,http://127.0.0.1:8083
```

## Docker / TrueNAS

Der Stack wird aus dem Projektwurzelverzeichnis gestartet:

```bash
docker compose up -d --build
```

Compose setzt intern `PORT=3003` und verbindet die API ueber
`mongodb://gastromania-mongo:27017/gastromania` mit MongoDB. Das Frontend
erreicht die API im Docker-Netzwerk ueber den Service-Namen
`gastromania-api:3003`.

## Deployment

```bash
./deploy.sh
```

Das Deployment-Script baut die Images, stoppt alte Container, fuehrt Cleanup
aus und startet den Stack neu.

## Tests

```bash
npm test
npm run test:e2e
```

## Troubleshooting

```bash
docker compose ps
docker compose logs -f gastromania-api
curl http://localhost:3003/health
curl http://localhost:8083/api/health
```

Wenn der API-Healthcheck `database: disconnected` meldet, `MONGODB_URI` und den
Container `gastromania-mongo` pruefen.
