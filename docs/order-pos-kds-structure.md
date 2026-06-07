# POS-, Bestell- und KDS-Struktur

Stand: 2026-06-07

Dieses Dokument beschreibt die bestehende Bestellarchitektur von Gastromania. Ziel ist Konsolidierung ohne zweite Order-, POS- oder KDS-Struktur.

## Fuehrende Struktur

Die fuehrende Bestell-Entity ist `Order` in `src/orders/schemas/order.schema.ts`.

Fuehrende Statusdefinitionen:

- `OrderStatus`
- `OrderItemStatus`
- `OrderSource`
- `PaymentStatus`
- `ProductionArea`

Fuehrende Collection/Schema:

- `Order`
- `OrderItem` als eingebettete Position in `Order.items`

Fuehrende APIs:

- Tisch-/Servicebestellungen: `OrdersController` unter `GET/POST/PATCH /orders`
- Thekenbestellungen: `CounterController` unter `/counter`, aber auf derselben `Order`-Collection mit `source = counter`
- KDS: `KdsController` unter `/kds`, arbeitet direkt auf derselben `Order`-Collection
- QR-Bestellungen: `QrOrdersService`, erzeugt `Order` mit `source = qr`
- Mobile Service: `MobileService`, nutzt fuer Schreiboperationen den fuehrenden `OrdersService`

## Bestellarten

### Tischbestellungen

Tischbestellungen werden ueber `OrdersService.create` erzeugt.

Kennzeichen:

- `locationId` ist Pflicht.
- `tableId` ist optional, aber fuer echte Tischbindung gesetzt.
- `source` bleibt standardmaessig `internal`.
- `orderNumber` wird pro Standort und Tag erzeugt.
- `pickupNumber` wird nur gesetzt, wenn keine Tisch-/Kundennummerbindung vorliegt.
- Tischstatus wird ueber `syncTableStatus` aktualisiert.

### Thekenbestellungen

Thekenbestellungen verwenden keine eigene Order-Entity.

Kennzeichen:

- `CounterOrderService` injiziert `Order.name`.
- Neue Thekenbestellungen werden mit `source = OrderSource.Counter` gespeichert.
- Listen und Reports filtern ueber `query.source = OrderSource.Counter`.
- Theken-spezifische Daten liegen auf `Order` (`pickupNumber`, `customerName`, Zahlungsfelder) und in separaten Log-/Settings-Schemas.

Theken-spezifische Zusatzschemas:

- `CounterOrderStatusLog`
- `CounterPayment`
- `CounterSettings`
- `PickupNumber`

Diese sind Zusatzdaten, aber keine zweite Bestellstruktur.

### QR-Bestellungen

QR-Bestellungen nutzen ebenfalls `Order`.

Kennzeichen:

- `QrOrdersService` injiziert `Order.name`.
- Neue QR-Bestellungen werden mit `source = OrderSource.Qr` gespeichert.
- `qrTokenId`, `qrUserAgent` und `guestNote` liegen auf `Order`.
- Tischstatus wird nach Erstellung direkt aktualisiert.

### Mobile Bestellungen

Mobile liest `Order` direkt fuer Dashboard/Listen und nutzt bei Schreiboperationen den fuehrenden `OrdersService`.

Kennzeichen:

- `MobileService.createOrder` ruft `OrdersService.create`.
- `MobileService.updateOrder` ruft `OrdersService.update`.
- Damit gibt es fuer Mobile keine zweite Schreiblogik.

## Statusmodell

Aktuelle `OrderStatus`-Werte:

- `Entwurf`
- `Neu`
- `Angenommen`
- `In Zubereitung`
- `Bereit zur Ausgabe`
- `Ausgegeben`
- `Geschlossen`
- `Storniert`

Aktuelle `OrderItemStatus`-Werte:

- `Offen`
- `Gestartet`
- `In Zubereitung`
- `Fertig`
- `Ausgegeben`
- `Storniert`

Fachlicher Flow:

- Offen/Neu
- Angenommen
- In Zubereitung
- Bereit zur Ausgabe
- Ausgegeben
- Geschlossen oder Storniert

Die Regel "sobald eine einzelne Position gestartet wird, gilt die gesamte Bestellung als in Arbeit" ist vorhanden:

- `OrdersService.updateItemStatus` setzt nach jeder Positionsaenderung `order.status = aggregateOrderStatus(order)`.
- `KdsService.updateItemStatus` macht dieselbe Aggregation.
- `aggregateOrderStatus` setzt `OrderStatus.Preparing`, sobald mindestens eine aktive Position `Started`, `Preparing`, `Ready` oder `Served` ist.

Wichtig: Die Aggregationslogik ist in `OrdersService` und `KdsService` aktuell dupliziert. Sie ist fachlich gleichartig, aber technisch eine Konsolidierungsaltlast.

## KDS-Anbindung

KDS liest und schreibt direkt auf `Order`.

KDS-Endpunkte:

- `GET /kds/orders`
- `GET /kds/orders/active`
- `PATCH /kds/orders/:id/status`
- `PATCH /kds/orders/:id/items/:itemId/status`
- `POST /kds/orders/:id/call`
- `POST /kds/orders/:id/complete`
- `POST /kds/orders/:id/cancel`
- `GET /kds/history`
- `GET /kds/pickup-display`

KDS verfolgt sowohl Order-Status als auch Positionsstatus.

Status-Events:

- `order.statusChanged`
- `order.status.changed`
- `order.item.status.changed`
- `order.itemUpdated`
- `order.readyForPickup`
- `order.completed`
- `order.cancelled`
- `table.status.changed`

KDS schreibt Statushistorie in `KdsStatusLog`. Diese Log-Struktur ist keine zweite Order-Struktur, sondern Audit/History fuer Produktionsereignisse.

## Tenant- und Standortfaehigkeit

Aktueller Order-Stand:

- `locationId` ist im `Order`-Schema Pflicht.
- `companyId` ist optional vorhanden.
- Ein explizites `tenantId` existiert im `Order`-Schema aktuell nicht.

Zugriffsschutz:

- `OrdersService`, `CounterOrderService`, `KdsService` nutzen `AccessPolicyService` fuer Standortfilter oder Standortzugriff.
- Operative Daten werden praktisch ueber `locationId` scoped.

Offene Architekturlaecke:

- Fuer die Zielhierarchie Tenant -> Bereich -> Region -> Stadt -> Standort sollte `tenantId` perspektivisch explizit auf `Order` ergaenzt werden.
- Bis dahin muss `locationId` als verbindliche operative Grenze erhalten bleiben.

Keine Migration wurde in diesem Schritt gebaut, weil dieser Schritt Analyse und Konsolidierung ohne neue Order-Struktur verlangt.

## Modulabhaengigkeiten

Bekannte Module:

- `pos`
- `counter_orders`
- `table_orders`
- `kds`
- `qr_orders`
- `digital_menu`

Frontend-Routing:

- `/orders` ist an `table_orders` gebunden.
- `/counter` und Unterrouten sind an `counter_orders` beziehungsweise `pos` gebunden.
- `/kds` ist an `kds` gebunden.
- QR-Order ist oeffentlich ueber `/qr-order/:token` erreichbar und nutzt backendseitig QR-Token-Validierung.

Backend:

- `CounterController` ist mit `@RequireModule(COUNTER_ORDERS_MODULE_KEY)` und `ModuleEnabledGuard` abgesichert.
- `OrdersController` hat aktuell keine `@RequireModule('table_orders')`-Absicherung.
- `KdsController` hat aktuell keine `@RequireModule('kds')`-Absicherung.
- `QrOrdersController` sollte perspektivisch tenant-/standortbezogen gegen `qr_orders` und/oder `digital_menu` geprueft werden, sobald der oeffentliche Token-Kontext Modulstatus sicher laden kann.

## Konsolidierungsbefund

Keine zweite fuehrende Order-Entity wurde gefunden.

Gefundene Zusatzstrukturen:

- `CounterOrderStatusLog`
- `CounterPayment`
- `CounterSettings`
- `PickupNumber`
- `KdsStatusLog`
- `KdsSettings`

Diese Zusatzstrukturen sind fachlich begruendet und ersetzen nicht `Order`.

Gefundene technische Altlasten:

1. `aggregateOrderStatus` ist in `OrdersService` und `KdsService` dupliziert.
2. Tischstatus-Synchronisation ist in `OrdersService` und `KdsService` dupliziert.
3. Rollenlisten fuer operative Controller enthalten teilweise Plattformrollen. Das sollte mit der Plattform-/Tenant-Trennung konsolidiert werden.
4. Backend-Modulschutz ist zwischen Counter, Orders, KDS und QR nicht einheitlich.
5. `Order` besitzt noch kein explizites `tenantId`.
6. Frontend hat getrennte API-Services fuer Tischbestellungen, Counter und KDS, verwendet aber ein gemeinsames Order-Modell fuer Counter und KDS. Das ist akzeptabel, solange die Backend-Entity fuehrend bleibt.

## Fuehrende Entscheidungen

- Neue POS-, Tisch-, QR-, Mobile- oder KDS-Funktionen muessen weiter `Order` verwenden.
- Keine neue `CounterOrder`-Entity einfuehren.
- Keine zweite KDS-Order-Struktur einfuehren.
- Neue Statuslogik gehoert perspektivisch in eine gemeinsame Order-Domain-Funktion oder einen gemeinsamen Service, damit `OrdersService` und `KdsService` dieselbe Aggregation verwenden.
- Operative Daten gehoeren weiterhin zum Standort. Eine spaetere Tenant-Migration muss `tenantId` ergaenzen, aber `locationId` darf nicht entfallen.

## Nicht umgesetzt in diesem Schritt

Bewusst nicht umgesetzt:

- keine neue POS-Oberflaeche
- keine neue Kasse
- keine QR-Neuentwicklung
- keine Payment-Provider
- keine Kitchen-Routing- oder Stationslogik
- keine Split-Payments
- keine grosse Tenant-ID-Migration
- kein Refactoring der Order-/KDS-Duplizierung

Diese Punkte sind nachgelagerte Konsolidierungs- oder Feature-Schritte.
