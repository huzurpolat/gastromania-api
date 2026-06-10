# Rezepturen, Lager und Wareneinsatz / COGS

Stand: 2026-06-08

Dieses Dokument beschreibt die bestehende Struktur fuer Lager, Rezepte,
Verkaufsartikel, Lieferanten und Wareneinsatz in Gastromania. Ziel dieses
Schritts ist Konsolidierung und Orientierung ohne zweite Rezept-, Lager-,
Produkt- oder COGS-Struktur.

## 1. Bestehende Strukturen

### Lager / Inventory

Fuehrendes Backend-Modul:

- `src/stock`

Gefundene Schemas:

- `StockItem` in `src/stock/schemas/stock-item.schema.ts`
- `StockMovement` in `src/stock/schemas/stock-movement.schema.ts`
- `InventoryBatch` in `src/stock/schemas/inventory-batch.schema.ts`
- `InventoryLocation` in `src/stock/schemas/inventory-location.schema.ts`
- `InventoryCategory` in `src/stock/schemas/inventory-category.schema.ts`
- `InventorySession` in `src/stock/schemas/inventory-session.schema.ts`
- `InventoryCount` in `src/stock/schemas/inventory-count.schema.ts`
- `StockAlert` in `src/stock/schemas/stock-alert.schema.ts`
- `PurchaseOrder` in `src/stock/schemas/purchase-order.schema.ts`

`StockItem` ist die fuehrende Lagerartikel-/Zutaten-Entity. Sie ist an
`locationId` gebunden und enthaelt Bestand, Einheit, Mindestbestand,
kritischen Bestand, Zielbestand, Lieferantenbezug, Einkaufspreise,
Durchschnittskosten, Lagerort, MHD-Pflicht und Zutatenkategorie.

Bestandsbewegungen werden ueber `StockMovement` gespeichert. Relevante Typen:

- `Wareneingang`
- `Warenausgang`
- `Verbrauch`
- `order_consumption`
- `order_cancel_reversal`
- `order_quantity_adjustment`
- `Schwund`
- `Bruch`
- `Verderb`
- `Verlust`
- `Korrektur`
- `Inventur`
- `Umbuchung`

Chargen und MHD werden ueber `InventoryBatch` abgebildet. Inventuren nutzen
`InventorySession` und `InventoryCount`. Lagerwarnungen werden ueber
`StockAlert` erzeugt. Einkaufsvorschlaege und einfache Bestellungen sind ueber
`PurchaseOrder` vorhanden.

### Rezepturen

Fuehrendes Backend-Modul:

- `src/recipes`

Gefundene Schemas und Services:

- `Recipe` in `src/recipes/schemas/recipe.schema.ts`
- eingebettete `RecipeIngredient`
- eingebettete `RecipeVariant`
- eingebettete `RecipeOption`
- eingebettete `RecipeComponent`
- eingebettete `RecipeStep`
- eingebettete `RecipeVersion`
- `RecipeService`
- `RecipeCalculationService`
- `RecipeInventoryService`

`Recipe` ist die fuehrende Rezeptur-Entity. Zutaten werden nicht als separate
globale Entity gespeichert, sondern als eingebettete `RecipeIngredient` mit
Referenz auf `StockItem.stockItemId`. Ein Rezept kann ueber `menuItemId` mit
einem Verkaufsartikel verknuepft werden.

Vorhandene Kalkulation:

- Zutatenkosten
- Komponentenkosten
- Gesamtkosten
- Kosten pro Portion
- Rohertrag
- Deckungsbeitrag
- Marge
- Food-Cost-Prozent
- Ampelstatus
- Allergene / Zusatzstoffe
- Naehrwerte
- Verfuegbarkeitspruefung pro Standort

Vorhandene Lagerintegration:

- `RecipeInventoryService.consumeOrder`
- `RecipeInventoryService.reverseOrder`
- `RecipeInventoryService.adjustOrder`
- FIFO-/MHD-nahe Chargenreduktion ueber `InventoryBatch` nach `expiresAt` und
  `receivedAt`
- Erstellung von `StockMovement` fuer Bestellverbrauch, Storno-Rueckbuchung
  und Mengenanpassung
- Low-Stock-Warnungen nach Verbrauch

### Verkaufsartikel / Menu Items / Products

Fuehrendes Backend-Modul:

- `src/menu-items`

Gefundenes Schema:

- `MenuItem` in `src/menu-items/schemas/menu-item.schema.ts`

Es gibt kein separates fuehrendes `products`-Modul. Fuer Verkaufsartikel ist
`MenuItem` die fuehrende Struktur.

`MenuItem` enthaelt:

- `name`
- `category`
- Farbfelder und Icon-Felder
- Beschreibung, Zutaten-Text, Gewicht, Bild
- `price` / `sellingPrice`
- `recipeId`
- `targetMargin`
- Kitchen-Flag und Eigenschaften
- Aktivstatus

Die Verknuepfung zum Rezept ist ueber `MenuItem.recipeId` vorhanden. Zusaetzlich
kann `Recipe.menuItemId` gesetzt sein. In Reports wird beides beruecksichtigt.

### Kategorien

Gefundene Strukturen:

- `MenuItem.category` als String
- `Recipe.category` als String
- `StockItem.category` als String
- `InventoryCategory` als Lagerklassifizierung

Es gibt aktuell keine separate fuehrende MenuCategory-Entity. Lagerkategorien
werden ueber `InventoryCategory` gepflegt; Speisen-/Getraenkekategorien liegen
aktuell direkt als String bzw. Farbfelder an `MenuItem`.

### Lieferanten

Fuehrendes Backend-Modul:

- `src/suppliers`

Gefundenes Schema:

- `Supplier` in `src/suppliers/schemas/supplier.schema.ts`

`Supplier` ist standortgebunden ueber `locationId`. Lieferanten enthalten
Kontakt- und Lieferinformationen, Mindestbestellwert, Kundennummer und
Aktiv-/Archivstatus. `StockItem` und `InventoryBatch` speichern optional
`supplierId` und `supplierName`.

### Weekly Menus

Fuehrendes Backend-Modul:

- `src/weekly-menus`

Gefundenes Schema:

- `WeeklyMenu`
- eingebettete `DailyMenu`
- eingebettete `DailyMenuItem`

Wochenkarten sind standortgebunden. Tagesmenues referenzieren Menu Items ueber
`menuItemId`, `menuItemIds` oder `menuItems` mit Angebotspreis. Sie sind keine
zweite Produktstruktur, sondern eine Angebots-/Planungsstruktur auf Basis von
`MenuItem`.

### Wareneinsatz / COGS / Margin Reports

Fuehrendes Backend-Modul:

- `src/reports`

Gefundene Schemas und Services:

- `MarginAnalysisRun`
- `MarginReportsService`

Wareneinsatz- und Margenreports laufen ueber `/reports/margins`. Die Berechnung
liest:

- `Order`
- `MenuItem`
- `Recipe`
- `StockItem`
- `Location`

Kostenbasis in Reihenfolge:

- `StockItem.averageCost`
- `StockItem.unitCost`
- `StockItem.lastPurchasePrice`
- `StockItem.purchasePriceNet`
- `RecipeIngredient.purchasePriceNet`
- `missing`

COGS werden aktuell rezeptbasiert berechnet:

- Umsatz aus relevanten Orders
- verkaufte Menge je MenuItem
- Rezeptkosten pro Portion
- Wareneinsatz = Rezeptkosten pro Portion * verkaufte Menge
- Deckungsbeitrag und Marge
- Warnungen fuer fehlende Rezepte, fehlende Einkaufspreise, negative Marge und
  Marge unter Zielmarge

## 2. Fuehrende Entities

Fuehrende fachliche Entscheidungen aus dem Bestand:

- Verkaufsartikel: `MenuItem`
- Rezeptur: `Recipe`
- Rezeptzutat: eingebettete `RecipeIngredient`
- Lagerartikel/Zutat: `StockItem`
- Lagerbewegung: `StockMovement`
- Lagercharge/MHD/FIFO-nahe Entnahme: `InventoryBatch`
- Lagerort: `InventoryLocation`
- Lagerkategorie: `InventoryCategory`
- Inventur: `InventorySession` und `InventoryCount`
- Lieferant: `Supplier`
- Einkauf / Nachbestellung: `PurchaseOrder`
- Wareneinsatzanalyse: `MarginReportsService` mit `MarginAnalysisRun`
- Wochenkarte: `WeeklyMenu` als Angebotsplanung auf `MenuItem`

Nicht fuehrend bzw. nicht vorhanden:

- kein separates `Product`-Feature
- keine zweite Rezept-Entity
- keine zweite Lagerartikel-Entity
- keine separate MenuCategory-Entity
- keine separate COGS-Entity fuer operative Buchungen

## 3. Fuehrende APIs

### Lager

Controller:

- `StockController` unter `/stock`

Wichtige Endpunkte:

- `GET /stock`
- `POST /stock`
- `PATCH /stock/:id`
- `DELETE /stock/:id`
- `POST /stock/:id/adjust`
- `POST /stock/receive`
- `POST /stock/waste`
- `GET /stock/movements`
- `GET /stock/batches`
- `GET /stock/dashboard`
- `GET /stock/alerts`
- `GET /stock/reports`
- `GET /stock/locations`
- `POST /stock/locations`
- `GET /stock/categories`
- `POST /stock/categories`
- `GET /stock/inventory-sessions`
- `POST /stock/inventory-sessions`
- `POST /stock/inventory-sessions/:id/complete`
- `GET /stock/reorder-suggestions`
- `GET /stock/purchase-orders`
- `POST /stock/purchase-orders`
- `GET /stock/stream`

Modulschutz:

- `inventory`

### Rezepte

Controller:

- `RecipesController` unter `/recipes`

Wichtige Endpunkte:

- `GET /recipes`
- `POST /recipes`
- `GET /recipes/:id`
- `PATCH /recipes/:id`
- `DELETE /recipes/:id`
- `POST /recipes/:id/copy`
- `PATCH /recipes/:id/archive`
- `GET /recipes/:id/costing`
- `GET /recipes/:id/nutrition`
- `GET /recipes/:id/allergens`
- `POST /recipes/:id/calculate`
- `GET /recipes/report`

Modulschutz:

- `recipes`

### Verkaufsartikel

Controller:

- `MenuItemsController` unter `/menu-items`

Wichtige Endpunkte:

- `GET /menu-items`
- `POST /menu-items`
- `GET /menu-items/:id`
- `PATCH /menu-items/:id`
- `DELETE /menu-items/:id`

Modulschutz:

- `digital_menu`

### Lieferanten

Controller:

- `SuppliersController` unter `/suppliers`

Wichtige Endpunkte:

- `GET /suppliers`
- `POST /suppliers`
- `PATCH /suppliers/:id`
- `DELETE /suppliers/:id`

Modulschutz:

- `inventory`

### Wareneinsatz / Margen

Controller:

- `ReportsController` unter `/reports/margins`

Wichtige Endpunkte:

- `GET /reports/margins`
- `GET /reports/margins/menu-items`
- `GET /reports/margins/locations`
- `GET /reports/margins/quadrant`
- `GET /reports/margins/summary`

Modulschutz:

- `cost_of_goods`

### Wochenkarten

Controller:

- `WeeklyMenusController` unter `/weekly-menus`

Wichtige Endpunkte:

- `GET /weekly-menus`
- `POST /weekly-menus`
- `PATCH /weekly-menus/:id`
- `DELETE /weekly-menus/:id`

Wochenkarten arbeiten auf `MenuItem`-Referenzen und sind keine eigene
Verkaufsartikelstruktur.

## 4. Vorhandene Frontend-Seiten

Gefundene fuehrende Seiten:

- Lager: `src/app/features/stock/pages/stock-page.component.ts`
- Lieferanten: `src/app/features/suppliers/pages/suppliers-page.component.ts`
- Rezepte: `src/app/features/recipes/pages/recipes-page.component.ts`
- Verkaufsartikel: `src/app/features/menu-items/pages/menu-items-page.component.ts`
- Wareneinsatz/Margen: `src/app/features/reports/margins/pages/margins-dashboard-page.component.ts`
- Wochenkarten: `src/app/features/weekly-menus/pages/weekly-menus-page.component.ts`

Gefundene API-Services:

- `StockApiService`
- `SuppliersApiService`
- `RecipesApiService`
- `MenuItemsApiService`
- `MarginReportsApiService`
- `WeeklyMenusApiService`

Navigation und Routing:

- `/stock` ist an `inventory` und `inventory.view` gebunden.
- `/suppliers` ist an `inventory` und Supplier-/Inventory-Permissions gebunden.
- `/recipes` ist an `recipes` und `recipes.view` gebunden.
- `/menu-items` ist an `digital_menu` und MenuItem-Permissions gebunden.
- `/reports/margins` ist an `cost_of_goods` und `reports.view` gebunden.
- Wochenkarten nutzen `MenuItem`-Daten, sind aber als eigene Seite vorhanden.

## 5. Luecken

Gefundene fachliche und technische Luecken:

1. `MenuItem` ist nicht explizit tenant- oder standortgebunden. Es gibt keinen
   `tenantId`/`locationId` auf dem Schema.
2. `MenuItem.category` ist String-basiert. Eine eigene MenuCategory-Entity mit
   Farbschema ist nicht als fuehrende Backend-Struktur vorhanden.
3. `Recipe` besitzt `companyId` und optional `locationId`, aber kein explizites
   `tenantId`.
4. `StockItem`, `Supplier`, `InventoryBatch`, `StockMovement` und Inventuren
   sind standortgebunden, aber ohne eigenes `tenantId` gespeichert.
5. `InventoryCategory` ist global eindeutig nach Name und nicht tenant- oder
   standortgebunden.
6. Automatischer Lagerabzug ist vorhanden, wird aber erst bei Wechsel einer
   Bestellung auf `OrderStatus.Accepted` ausgefuehrt.
7. Einheitliche Einheitenumrechnung ist nicht vorhanden. Einheit wird als
   String verglichen; Abweichungen erzeugen Warnungen, aber keine Umrechnung.
8. `RecipeInventoryService.findRecipe` findet Rezepte ueber `menuItemId` oder
   Rezeptname. Das ist praktikabel, aber `recipeId` auf `MenuItem` und
   `menuItemId` auf `Recipe` sollten langfristig eindeutig konsolidiert werden.
9. Einkaufsmodul ist nur als einfache `PurchaseOrder`-Struktur vorhanden; es
   gibt keine vollstaendige Lieferantenbestellung mit Statusfluss bis
   Wareneingang.
10. Wareneinsatzreports berechnen COGS aus Rezeptkosten und Sales, nicht aus
    tatsaechlich gebuchten `StockMovement`-Verbrauchswerten.
11. Die Controller fuer Stock/Recipes/MenuItems/Suppliers enthalten teilweise
    Plattformrollen in `@Roles`. Die Service-/Access-Policies verhindern
    operative Plattformnutzung an manchen Stellen, aber die Rollenlisten sollten
    perspektivisch mit der Platform-/Tenant-Trennung vereinheitlicht werden.
12. `RecipeCalculationService` verwendet gespeicherte
    `RecipeIngredient.purchasePriceNet`; `MarginReportsService` nutzt eine
    robustere Kostenbasis aus `StockItem`. Diese Kostenbasis sollte fuer
    Rezeptkalkulation und Reporting perspektivisch vereinheitlicht werden.

## 6. Risiken

1. Cross-Tenant-Risiko bei globalen Menu Items: Ohne `tenantId` auf `MenuItem`
   koennen Verkaufsartikel tenantuebergreifend sichtbar werden, wenn der
   Zugriff nicht anderweitig begrenzt wird.
2. Cross-Tenant-Risiko bei globalen Lagerkategorien: `InventoryCategory` ist
   global eindeutig und damit nicht mandantenrein.
3. Rezept-zu-Artikel-Verknuepfung kann uneindeutig werden, weil sowohl
   `MenuItem.recipeId` als auch `Recipe.menuItemId` existieren.
4. Lagerabzug bei Status `Accepted` ist fachlich vorhanden, aber bei anderen
   Order-Flows muss sichergestellt bleiben, dass kein doppelter Abzug oder
   fehlender Abzug entsteht.
5. Keine echte Einheitenumrechnung bedeutet, dass kg/g/l/ml/Stueck nur dann
   korrekt funktionieren, wenn Rezept und Lagerartikel dieselbe Einheit
   verwenden.
6. COGS-Reports koennen von realen Bewegungsbuchungen abweichen, weil sie
   rezeptbasiert kalkulieren und nicht direkt aus `StockMovement` aggregieren.
7. Purchase Orders sind aktuell nicht tief mit Wareneingang und Chargenfluss
   verheiratet. Manuelle Wareneingaenge koennen dadurch vom Bestellstatus
   abweichen.

## 7. Empfehlung fuer Schritt 2

Schritt 2 sollte keine neue Struktur einfuehren, sondern die vorhandene
Fuehrungsstruktur haerten:

1. `MenuItem` tenantfaehig machen:
   - `tenantId`
   - optional `locationId`
   - Migration/Backfill ueber bestehende Standort-/Tenant-Demo-Daten
   - Queries strikt auf Tenant filtern
2. `InventoryCategory` tenantfaehig machen oder bewusst als Systemkatalog
   deklarieren. Fuer Tenant-spezifische Lagerkategorien ist `tenantId`
   erforderlich.
3. Rezept-/Artikel-Verknuepfung konsolidieren:
   - fuehrende Beziehung definieren, bevorzugt `MenuItem.recipeId`
   - `Recipe.menuItemId` weiterhin lesen, aber nicht als zweite Wahrheit
     ausbauen
4. Gemeinsame Kostenbasis fuer Rezeptkalkulation und Margin-Reports verwenden:
   - `averageCost > unitCost > lastPurchasePrice > purchasePriceNet >
     recipePurchasePriceNet`
5. Einheitliche Unit-Normalisierung vorbereiten:
   - zunaechst erlaubte Einheiten und Validierung dokumentieren
   - noch keine komplexe Umrechnung bauen
6. Automatischen Lagerabzug weiter stabilisieren:
   - vorhandenen `RecipeInventoryService` beibehalten
   - Tests fuer Accepted, Storno, Mengenanpassung und doppelte Abbuchung
     ausbauen
7. COGS-Reports zweigleisig verifizieren:
   - weiterhin rezeptbasierte Vorschau
   - spaeter optional Ist-Wareneinsatz aus `StockMovement`

Nicht empfohlen:

- kein neues `Product`-Modul
- keine zweite Recipe-Entity
- keine zweite Inventory-Entity
- keine parallele COGS-Berechnung neben `MarginReportsService`
- keine komplexe Einheitenumrechnung in Schritt 2

