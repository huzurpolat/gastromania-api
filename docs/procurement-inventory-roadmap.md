# Lieferanten, Einkauf und Wareneingang

Stand: 2026-06-10

Dieses Dokument beschreibt den vorhandenen Stand fuer Lieferanten,
Einkauf, Wareneingang und Lager in Gastromania. Ziel dieses Schritts ist
Bestandsanalyse und Konsolidierung. Es wurde bewusst keine neue Einkaufs-,
Wareneingangs-, Inventur- oder Lagerstruktur gebaut.

Fortschreibung Schritt 2:

- `PurchaseOrder` bleibt die fuehrende Einkaufsbestellung.
- Purchase-Order-Positionen speichern nun erwartete Kosten, erhaltene Menge und
  offene Menge.
- `POST /stock/receive` kann eine Purchase Order und eine
  Purchase-Order-Position referenzieren.
- Wareneingang aktualisiert die erhaltene Menge und setzt den Status automatisch
  auf `Teilweise geliefert` oder `Geliefert`.
- Bestand, `InventoryBatch` und `StockMovement` bleiben die fuehrenden
  Wareneingangs- und COGS-Strukturen.

Fortschreibung Schritt 3:

- Einkaufspreise bleiben in der bestehenden Struktur. Es wurde keine neue
  Preis- oder Bewertungs-Entity eingefuehrt.
- `StockItem.averageCost` ist die fuehrende Bestandsbewertung je Einheit.
  `StockItem.lastPurchasePrice` dokumentiert den letzten Wareneingangspreis.
- `POST /stock/receive` aktualisiert `lastPurchasePrice`, den gewichteten
  Durchschnittspreis (`averageCost`/`unitCost`) und den Lagerwert.
- `StockMovement.valueNet` wird beim Wareneingang aus Menge mal
  Wareneingangspreis geschrieben.
- `InventoryBatch.unitPriceNet` bleibt die Chargen-Preisquelle; API-Responses
  liefern daraus den Chargenwert.

## 1. Bestehende Supplier-Struktur

Fuehrendes Backend-Modul:

- `src/suppliers`

Fuehrende Entity:

- `Supplier` in `src/suppliers/schemas/supplier.schema.ts`

Vorhandene API:

- `GET /suppliers`
- `POST /suppliers`
- `PATCH /suppliers/:id`
- `DELETE /suppliers/:id`

Modul- und Zugriffsschutz:

- Modulschutz: `inventory`
- Permissions: `suppliers.view`, `suppliers.create`, `suppliers.update`,
  `suppliers.delete`
- Rollen: Platform-/Super-/Company-/Region-/Admin-Rollen sowie
  `Filialleiter`, `Lager`, `Einkauf`
- Zugriff wird im Service ueber `AccessPolicyService.assertCanAccessLocation`
  und `getReadableLocationIds` auf erlaubte Standorte begrenzt.

Vorhandene Felder:

- `locationId`
- `name`
- `contactName`
- `phone`
- `email`
- `website`
- `street`
- `zip`
- `city`
- `country`
- `deliveryDays`
- `orderDeadline`
- `minimumOrderValue`
- `customerNumber`
- `note`
- `isActive`
- `isArchived`
- automatische `createdAt` / `updatedAt`

Duplikatschutz:

- eindeutiger Index auf `{ locationId: 1, name: 1 }`

Bewertung:

`Supplier` ist die fuehrende Lieferanten-Entity. Sie ist aktuell eindeutig
standortbezogen, aber nicht explizit tenantbezogen. Die Tenant-Isolation ergibt
sich indirekt ueber den Standortzugriff. Fuer Schritt 2 sollte `tenantId` nicht
als zweite Struktur, sondern als zusaetzliches Sicherheitsfeld an der
bestehenden Supplier-Entity ergaenzt werden.

Frontend:

- `src/app/features/suppliers/pages/suppliers-page.component.ts`
- `src/app/features/suppliers/services/suppliers-api.service.ts`
- `src/app/features/suppliers/services/suppliers-store.service.ts`
- `src/app/features/suppliers/models/supplier.model.ts`

Die Lieferanten-Seite erlaubt Standortauswahl, Suche, Anlegen und Bearbeiten
von Lieferanten. Ein Loeschbutton ist im Service/API vorhanden, aber auf der
aktuellen Seite nicht als sichtbare Listenaktion ausgebaut.

## 2. Bestehende Lagerstruktur

Fuehrendes Backend-Modul:

- `src/stock`

Fuehrende Entities:

- `StockItem` in `src/stock/schemas/stock-item.schema.ts`
- `StockMovement` in `src/stock/schemas/stock-movement.schema.ts`
- `InventoryBatch` in `src/stock/schemas/inventory-batch.schema.ts`
- `InventoryLocation` in `src/stock/schemas/inventory-location.schema.ts`
- `InventoryCategory` in `src/stock/schemas/inventory-category.schema.ts`
- `InventorySession` in `src/stock/schemas/inventory-session.schema.ts`
- `InventoryCount` in `src/stock/schemas/inventory-count.schema.ts`
- `StockAlert` in `src/stock/schemas/stock-alert.schema.ts`
- `PurchaseOrder` in `src/stock/schemas/purchase-order.schema.ts`

`StockItem` ist die fuehrende Lagerartikel-/Zutaten-Entity. Sie enthaelt:

- optional `tenantId`
- `locationId`
- Artikelnummer, Name, Beschreibung, Kategorie
- Einheit
- Bestand, Mindestbestand, kritischen Bestand, Zielbestand
- optional `supplierId` und `supplierName`
- EAN
- `purchasePriceNet`
- `lastPurchasePrice`
- `averageCost`
- `unitCost`
- `costUnit`
- `purchasePriceGross`
- Verkaufspreis und MwSt
- Lagerort
- MHD-Pflicht
- Zutatenkategorie
- Notiz
- Aktiv-/Archivstatus

Duplikatschutz:

- eindeutiger Index auf `{ locationId: 1, name: 1 }`
- Index auf `{ locationId: 1, articleNumber: 1 }`

`StockMovement` ist die fuehrende Bewegungs-Entity. Vorhandene Typen:

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

`StockMovement` enthaelt:

- optional `tenantId`
- `locationId`
- `stockItemId`
- optional `batchId`
- optional `orderId`, `orderItemId`, `recipeId`, `menuItemId`
- optional `referenceType` und `referenceId`
- Artikelname, Typ, Mengenveraenderung, Menge, Einheit
- Bestand vorher/nachher
- optional Lieferant
- `unitPriceNet`
- `valueNet`
- Notiz, Grund und `actorId`

`InventoryBatch` bildet Chargen und MHD/FIFO-nahe Entnahme ab. Es speichert:

- `locationId`
- `stockItemId`
- Artikelname, Einheit, Charge
- Anfangsbestand, Restbestand
- `unitPriceNet`
- optional Lieferant
- Lagerort
- Wareneingangsdatum
- MHD
- Notiz und Aktivstatus

Bewertung:

Die Lagerstruktur ist bereits fuehrend und soll nicht ersetzt werden. Fuer
Einkauf und Wareneingang muessen kuenftige Erweiterungen an `StockItem`,
`StockMovement`, `InventoryBatch` und `PurchaseOrder` anschliessen.

## 3. Einkaufspreisquelle

Vorhandene Preisfelder:

- `StockItem.purchasePriceNet`
- `StockItem.purchasePriceGross`
- `StockItem.lastPurchasePrice`
- `StockItem.averageCost`
- `StockItem.unitCost`
- `RecipeIngredient.purchasePriceNet`
- `StockMovement.unitPriceNet`
- `StockMovement.valueNet`
- `InventoryBatch.unitPriceNet`
- `PurchaseOrderLine.unitPriceNet`
- `PurchaseOrderLine.totalNet`

Aktuelle fuehrende operative Preisquelle:

- Fuer Artikelstamm-Fallback bleibt `StockItem.purchasePriceNet` vorhanden.
- Fuer Bestandsbewertung und Nachbestellvorschlaege fuehrt
  `StockItem.averageCost` mit Fallback auf `unitCost`, `lastPurchasePrice` und
  `purchasePriceNet`.
- Fuer gebuchten Wareneingang fuehrt `ReceiveStockDto.unitPriceNet`, mit
  Fallback auf die zentrale StockItem-Bewertung.
- Fuer echte Verbrauchs-COGS fuehrt `StockMovement.valueNet`.
- Fuer Rezept-/Kalkulationsfallback nutzt `MarginReportsService` die Reihenfolge
  `averageCost > unitCost > lastPurchasePrice > purchasePriceNet >
  recipePurchasePriceNet`.

Mehrlieferantenfaehigkeit:

- Aktuell ist pro `StockItem` genau ein bevorzugter Lieferant ueber
  `supplierId`/`supplierName` abbildbar.
- `StockMovement` und `InventoryBatch` koennen den Lieferanten der konkreten
  Buchung speichern.
- Es gibt keine eigene Supplier-Article-/Supplier-Price-Entity fuer mehrere
  Lieferanten, Staffelpreise, Gebinde, Mindestmengen oder Lieferantenartikel-
  nummern.

Risiko:

Wenn ein Artikel bei mehreren Lieferanten bezogen wird, muss der Preis derzeit
entweder beim Wareneingang manuell gesetzt oder der bevorzugte Lieferant am
StockItem umgestellt werden. Fuer Schritt 2 sollte keine parallele Preisstruktur
gebaut werden; sinnvoll ist eine kleine Erweiterung am bestehenden Modell, z.B.
`SupplierItem` oder eingebettete Lieferantenpreise, aber erst nach Festlegung
der fuehrenden Relation.

## 4. Vorhandene Einkaufslogik

Vorhandene Backend-Struktur:

- `PurchaseOrder` in `src/stock/schemas/purchase-order.schema.ts`
- `CreatePurchaseOrderDto` in `src/stock/dto/create-purchase-order.dto.ts`
- `StockService.reorderSuggestions`
- `StockService.listPurchaseOrders`
- `StockService.createPurchaseOrder`
- Controller-Endpunkte:
  - `GET /stock/reorder-suggestions`
  - `GET /stock/purchase-orders`
  - `POST /stock/purchase-orders`

`PurchaseOrder` enthaelt:

- optional `companyId`
- `locationId`
- `supplierId`
- `supplierName`
- `orderNumber`
- Status: `Entwurf`, `Bestellt`, `Teilweise geliefert`, `Geliefert`,
  `Storniert`
- Lines mit `stockItemId`, Name, Menge, Einheit, `unitPriceNet`, `totalNet`
- `totalNet`
- Notiz
- `createdBy`
- automatische Zeitstempel

Aktueller Ablauf:

1. `reorderSuggestions` liest aktive Lagerartikel unter Mindestbestand.
2. Es gruppiert Vorschlaege nach `StockItem.supplierId`/`supplierName`.
3. Die Vorschlagsmenge ist Zielbestand minus aktuellem Bestand.
4. Der Preis stammt aus `StockItem.purchasePriceNet`.
5. `createPurchaseOrder` erstellt einen PO-Entwurf mit generierter
   `PO-00001`-Nummer pro Standort.

Frontend:

- `StockApiService.getReorderSuggestions`
- `StockApiService.getPurchaseOrders`
- `StockApiService.createPurchaseOrder`
- `StockStoreService.createPurchaseOrder`
- `StockPageComponent` zeigt "Nachbestellung" und erstellt per Button einen
  PO-Entwurf aus Mindestbestandsvorschlaegen.

Bewertung:

Es existiert eine nutzbare Einkaufsbasis. Statuswechsel von `Entwurf` zu
`Bestellt` sind vorhanden. Wareneingang gegen eine Bestellposition aktualisiert
`receivedQuantity` und setzt den PO-Status automatisch auf
`Teilweise geliefert` oder `Geliefert`.

Weiterhin offen sind Bearbeitung von Draft-Lines, Bestellung an Lieferanten,
Liefertermin, externe Belegnummer, Storno-Detailregeln und Audit-Historie.

## 5. Vorhandene Wareneingangslogik

Vorhandene Backend-Struktur:

- `ReceiveStockDto` in `src/stock/dto/receive-stock.dto.ts`
- `StockService.receiveStock`
- Controller-Endpunkt: `POST /stock/receive`
- Bewegungsart: `StockMovementType.Receipt = 'Wareneingang'`
- Chargenstruktur: `InventoryBatch`

Aktueller Ablauf bei `receiveStock`:

1. `StockItem` wird per `stockItemId` geladen.
2. Standortzugriff wird ueber `AccessPolicyService` geprueft.
3. Bei MHD-pflichtigen Artikeln ist `expiresAt` erforderlich.
4. Menge wird auf den Artikelbestand addiert.
5. `purchasePriceNet` am StockItem wird mit dem Wareneingangspreis
   aktualisiert, wenn ein Preis geliefert wurde.
6. Lieferant und Lagerort werden am StockItem fortgeschrieben, falls geliefert.
7. `InventoryBatch` wird mit Menge, Preis, Lieferant, Lagerort,
   Wareneingangsdatum und MHD angelegt.
8. `StockMovement` vom Typ `Wareneingang` wird mit `unitPriceNet` und
   `valueNet` erstellt.
9. Lagerwarnungen und MHD-Warnungen werden synchronisiert.

Frontend:

- `StockPageComponent` enthaelt eine Wareneingangs-Karte mit Artikel, Menge,
  Charge, MHD, EK netto und Notiz.
- `StockStoreService.receive` ruft `POST /stock/receive` auf.
- Der Lieferant wird aktuell aus dem bevorzugten Lieferanten am StockItem
  uebernommen, nicht explizit im Wareneingangsformular gewaehlt.

Bewertung:

Wareneingang existiert operativ und ist mit Bestand, Charge, StockMovement und
COGS-Datenbasis verbunden. Zusaetzlich kann Wareneingang inzwischen optional
eine `PurchaseOrder` und `PurchaseOrderLine` referenzieren. Teilwareneingaenge
gegen eine Bestellung sind damit im bestehenden `POST /stock/receive`-Flow
modelliert.

Es gibt weiterhin keine eigene `GoodsReceipt`-Entity. Das ist bewusst so:
`StockMovement` und `InventoryBatch` bleiben die fuehrende
Wareneingangsstruktur.

## 6. Fuehrende Entities

Fuehrend fuer den naechsten Block sind:

- Lieferant: `Supplier`
- Lagerartikel / Zutat: `StockItem`
- Lagerbewegung / COGS-Istkosten: `StockMovement`
- Charge / MHD / FIFO-nahe Entnahme: `InventoryBatch`
- Einkaufsbestellung / PO-Entwurf: `PurchaseOrder`
- Einkaufsbestellposition: eingebettete `PurchaseOrderLine`
- Wareneingang heute: `StockMovement` Typ `Wareneingang` plus `InventoryBatch`
- Rezeptur: `Recipe`
- Rezeptzutat: eingebettete `RecipeIngredient` mit Referenz auf `StockItem`
- Verkaufsartikel: `MenuItem`
- Wareneinsatz-Reporting: `MarginReportsService`

Nicht fuehrend bzw. nicht vorhanden:

- kein separates `procurement`-Modul
- kein separates `goods-receipt`-Modul
- keine separate `GoodsReceipt`-Entity
- keine separate `SupplierDelivery`-Entity
- keine mehrlieferantenfaehige Supplier-Price-Entity
- keine Bestandsbewertung als eigenes Modul
- keine externe Lieferantenbestellung/EDI/DATEV-Struktur

## 7. Risiken

1. `Supplier` hat kein eigenes `tenantId`. Die Isolation laeuft indirekt ueber
   `locationId` und AccessPolicy. Das ist nutzbar, aber fuer robuste
   Multi-Tenant-Datenhaltung nicht optimal.
2. `PurchaseOrder` hat `companyId`, aber kein `tenantId`. Auch hier laeuft die
   Isolation ueber `locationId`.
3. `InventoryBatch` hat kein `tenantId`. Chargen sind standortgebunden und
   damit indirekt tenantgebunden.
4. `StockMovement.tenantId` ist optional. Order-Verbrauch setzt `tenantId`,
   manuelle Lager- und Wareneingangsbuchungen aus `StockService` setzen es
   aktuell nicht konsequent.
5. `StockItem.tenantId` ist optional und wird beim Erstellen im StockService
   nicht konsequent aus dem Actor gesetzt.
6. `PurchaseOrder.supplierId` wird beim Erstellen nicht gegen eine Supplier-
   Entity am selben Standort validiert; die Standortvalidierung laeuft primaer
   ueber die PO-Location und die StockItems.
7. `PurchaseOrder` kann erstellt, gelistet, als bestellt markiert und ueber
   Wareneingang abgeschlossen werden. Bearbeiten von Draft-Lines, Storno-Flow
   und Audit-Historie fehlen noch.
8. Wareneingang ist mit Purchase Orders verbunden, wenn `purchaseOrderId` und
   `purchaseOrderLineId` gesetzt werden. Manuelle Wareneingaenge ohne PO bleiben
   weiterhin moeglich.
9. Mehrlieferantenfaehigkeit und artikelbezogene Lieferantenpreise fehlen.
10. Einkaufspreise sind an mehreren Stellen vorhanden. Die Schreibregel ist
    jetzt enger: Wareneingang schreibt `lastPurchasePrice`, `averageCost`,
    `unitCost`, `InventoryBatch.unitPriceNet` und `StockMovement.valueNet`.
    Risiko bleibt bei manuell editierten Stammpreisen und historischen Daten.
11. Einheitliche Einheitenumrechnung existiert nicht. Rezept, Lagerartikel, PO
    und Wareneingang arbeiten mit Einheiten-Strings.
12. Frontend-Einkauf ist in der grossen Lagerseite eingebettet. Fuer einen
    komplexeren Einkaufsprozess kann diese Seite unuebersichtlich werden.

## 8. Empfehlung fuer Schritt 2

Schritt 2 sollte die vorhandene Struktur haerten, nicht neu bauen.

Empfohlene Reihenfolge:

1. Tenant-Sicherheit in bestehenden Entities nachziehen:
   - `Supplier.tenantId`
   - `PurchaseOrder.tenantId`
   - `InventoryBatch.tenantId`
   - `StockItem.tenantId` konsequent setzen
   - `StockMovement.tenantId` konsequent bei manuellen Bewegungen und
     Wareneingang setzen
   - Backfill nur eindeutig ueber `locationId -> tenantId`
2. Supplier-Validierung in Stock/PurchaseOrder staerken:
   - `supplierId` muss, wenn gesetzt, zum selben Tenant und Standort gehoeren
   - kein Cross-Location- oder Cross-Tenant-Lieferant an StockItem/PO/Movement
3. PurchaseOrder als bestehende Einkaufsbasis weiter ausbauen:
   - Bearbeiten von Draft-Lines
   - Storno mit klarer Regel
   - Liefertermin und externe Belegnummer
   - Audit-Historie
   - keine neue `ProcurementOrder`-Entity bauen
4. Wareneingang gegen PurchaseOrder weiter schaerfen:
   - Lieferantenwahl im Wareneingangsformular sichtbarer machen
   - Ueberlieferungs- und Unterlieferungsregeln fachlich definieren
   - PO-Status weiterhin aus gelieferten Mengen ableiten
   - bestehendes `POST /stock/receive` beibehalten statt parallelen
     GoodsReceipt-Flow bauen
5. Einkaufspreis-Schreibregel definieren:
   - Wareneingang setzt `lastPurchasePrice`
   - `averageCost` wird aus Bewegungen oder Chargen berechnet
   - `purchasePriceNet` bleibt Standard-/Listenpreis
   - COGS nutzt fuer Istwerte weiter `StockMovement.valueNet`
6. Mehrlieferantenfaehigkeit erst danach:
   - entweder eingebettete Supplier-Preise am StockItem
   - oder kleine `SupplierItem`-Entity
   - keine Implementierung vor geklaerter Preis- und Gebindelogik
7. Frontend schrittweise trennen:
   - Lagerseite bleibt fuehrend fuer Bestand und schnelle Buchung
   - eine spaetere Einkaufsansicht darf `PurchaseOrder` nur als vorhandene
     fuehrende Entity nutzen
   - Wareneingang bleibt technisch an `StockMovement`/`InventoryBatch`
     gekoppelt

Nicht empfohlen:

- kein neues `procurement`-Modul parallel zu `stock`
- keine zweite Lieferanten-Entity
- keine zweite Lagerartikel-Entity
- keine neue Wareneingangslogik ohne Bezug zu `StockMovement`
- keine Bestandsbewertung oder Inventur in diesem Schritt
- keine komplexe Einheitenumrechnung in Schritt 2
