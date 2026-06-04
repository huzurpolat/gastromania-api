export interface ModuleDefinition {
  key: string;
  name: string;
  description: string;
  category: string;
  enabled: boolean;
  systemLocked: boolean;
}

export const COUNTER_ORDERS_MODULE_KEY = 'counter_orders';

export const DEFAULT_MODULES: ModuleDefinition[] = [
  {
    key: 'pos',
    name: 'POS / Kassensystem',
    description: 'Kassierfunktionen und Verkaufsabschluss am Standort.',
    category: 'Verkauf',
    enabled: true,
    systemLocked: false,
  },
  {
    key: COUNTER_ORDERS_MODULE_KEY,
    name: 'Thekenbestellung',
    description: 'Abhol- und Thekenbestellungen mit Abholnummern und Zahlungsfluss.',
    category: 'Betrieb',
    enabled: true,
    systemLocked: false,
  },
  {
    key: 'tables',
    name: 'Tischverwaltung',
    description: 'Tische, Tischstatus und Tischplaner fuer den Service.',
    category: 'Betrieb',
    enabled: true,
    systemLocked: false,
  },
  {
    key: 'kds',
    name: 'Kuechenmonitor / KDS',
    description: 'Produktionsboard fuer Kueche, Bar und Ausgabe.',
    category: 'Produktion',
    enabled: true,
    systemLocked: false,
  },
  {
    key: 'qr_orders',
    name: 'QR-Bestellungen',
    description: 'Gastbestellungen ueber QR-Code und digitale Tischbestellung.',
    category: 'Verkauf',
    enabled: true,
    systemLocked: false,
  },
  {
    key: 'digital_menu',
    name: 'Digitale Speisekarte',
    description: 'Digitale Darstellung von Artikeln, Kategorien und Wochenkarten.',
    category: 'Speisen & Getraenke',
    enabled: true,
    systemLocked: false,
  },
  {
    key: 'inventory',
    name: 'Lagerverwaltung',
    description: 'Bestand, Wareneingang, Inventur und Lagerwarnungen.',
    category: 'Lager',
    enabled: true,
    systemLocked: false,
  },
  {
    key: 'recipes',
    name: 'Rezeptverwaltung',
    description: 'Rezepte, Zutatenverbrauch und Kalkulation pro Artikel.',
    category: 'Speisen & Getraenke',
    enabled: true,
    systemLocked: false,
  },
  {
    key: 'margins',
    name: 'Wareneinsatz',
    description: 'Marge, Rezeptkosten und Wareneinsatz-Auswertungen.',
    category: 'Auswertungen',
    enabled: true,
    systemLocked: false,
  },
  {
    key: 'daily_closings',
    name: 'Tagesabschluss',
    description: 'Tagesabschluss, Kassenabschluss und Exportvorbereitung.',
    category: 'Verkauf',
    enabled: true,
    systemLocked: false,
  },
  {
    key: 'staff',
    name: 'Personalverwaltung',
    description: 'Dienstplanung, HR, Zeiterfassung und Mitarbeiterverwaltung.',
    category: 'Personal',
    enabled: true,
    systemLocked: false,
  },
  {
    key: 'reporting',
    name: 'Reporting',
    description: 'Auswertungen, Kennzahlen und Management-Reports.',
    category: 'Auswertungen',
    enabled: true,
    systemLocked: false,
  },
  {
    key: 'payments',
    name: 'Zahlungen',
    description: 'Zahlungsstatus, Zahlungsarten und Zahlungsauswertung.',
    category: 'Verkauf',
    enabled: true,
    systemLocked: false,
  },
  {
    key: 'invoices',
    name: 'Rechnungen',
    description: 'Rechnungs- und Belegfunktionen fuer Bestellungen.',
    category: 'Verkauf',
    enabled: true,
    systemLocked: false,
  },
  {
    key: 'cancellations',
    name: 'Stornos',
    description: 'Stornierungen, Stornogruende und Nachvollziehbarkeit.',
    category: 'Verkauf',
    enabled: true,
    systemLocked: false,
  },
  {
    key: 'module_management',
    name: 'Modulverwaltung',
    description: 'Zentrale Steuerung der aktivierten Systemmodule.',
    category: 'Administration',
    enabled: true,
    systemLocked: true,
  },
];
