# Gastromania API - Agent Instructions

## Projekt
NestJS Backend für Gastromania, eine Gastronomie-Management-App.

## Tech Stack
- NestJS
- TypeScript strict mode
- MongoDB Atlas
- Mongoose
- REST API
- später JWT Auth, Rollen und WebSockets

## Befehle
- Installieren: `npm install`
- Start Dev Server: `npm run start:dev`
- Tests: `npm test`
- Build: `npm run build`

## Architektur
- Feature-Module verwenden
- Kein Business-Code in AppModule
- AppModule nur für Config, Datenbank und Feature-Module
- DTOs mit class-validator
- Schemas unter `schemas/`
- DTOs unter `dto/`
- Services enthalten Business-Logik
- Controller enthalten nur Routing/HTTP

## Code Style
- TypeScript strict beachten
- Keine `any` verwenden
- async/await verwenden
- Validierung über DTOs
- MongoDB Zugriff nur über Services
- Fehler mit Nest Exceptions werfen

## Aktueller Fokus
Wir bauen zuerst das Feature `locations`:
- Location Schema
- CreateLocationDto
- UpdateLocationDto
- LocationsService CRUD
- LocationsController REST Endpoints