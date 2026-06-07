export interface ModuleDefinition {
  key: string;
  name: string;
  description: string;
  category: string;
  defaultEnabled: boolean;
  systemLocked: boolean;
  sortOrder: number;
}

export const COUNTER_ORDERS_MODULE_KEY = 'counter_orders';
export const STAFF_MANAGEMENT_MODULE_KEY = 'staff_management';
export const TIME_TRACKING_MODULE_KEY = 'time_tracking';
export const INVENTORY_MODULE_KEY = 'inventory';
export const KDS_MODULE_KEY = 'kds';
export const REPORTING_MODULE_KEY = 'reporting';
export const QR_ORDERS_MODULE_KEY = 'qr_orders';
export const DIGITAL_MENU_MODULE_KEY = 'digital_menu';

export const DEFAULT_MODULES: ModuleDefinition[] = [
  {
    key: 'pos',
    name: 'POS / Kassensystem',
    description: 'Kassierfunktionen und Verkaufsabschluss am Standort.',
    category: 'Verkauf',
    defaultEnabled: true,
    systemLocked: false,
    sortOrder: 10,
  },
  {
    key: COUNTER_ORDERS_MODULE_KEY,
    name: 'Thekenbestellung',
    description: 'Abhol- und Thekenbestellungen mit Abholnummern und Zahlungsfluss.',
    category: 'Betrieb',
    defaultEnabled: true,
    systemLocked: false,
    sortOrder: 20,
  },
  {
    key: 'table_orders',
    name: 'Tischbestellungen',
    description: 'Bestellungen am Tisch durch Service oder digitale Kanaele.',
    category: 'Betrieb',
    defaultEnabled: true,
    systemLocked: false,
    sortOrder: 30,
  },
  {
    key: 'table_management',
    name: 'Tischverwaltung',
    description: 'Tische, Tischstatus und Tischplaner fuer den Service.',
    category: 'Betrieb',
    defaultEnabled: true,
    systemLocked: false,
    sortOrder: 40,
  },
  {
    key: 'kds',
    name: 'Kuechenmonitor / KDS',
    description: 'Produktionsboard fuer Kueche, Bar und Ausgabe.',
    category: 'Produktion',
    defaultEnabled: true,
    systemLocked: false,
    sortOrder: 50,
  },
  {
    key: 'qr_orders',
    name: 'QR-Bestellungen',
    description: 'Gastbestellungen ueber QR-Code und digitale Tischbestellung.',
    category: 'Verkauf',
    defaultEnabled: true,
    systemLocked: false,
    sortOrder: 60,
  },
  {
    key: 'digital_menu',
    name: 'Digitale Speisekarte',
    description: 'Digitale Darstellung von Artikeln, Kategorien und Wochenkarten.',
    category: 'Speisen & Getraenke',
    defaultEnabled: true,
    systemLocked: false,
    sortOrder: 70,
  },
  {
    key: 'inventory',
    name: 'Lagerverwaltung',
    description: 'Bestand, Wareneingang, Inventur und Lagerwarnungen.',
    category: 'Lager',
    defaultEnabled: true,
    systemLocked: false,
    sortOrder: 80,
  },
  {
    key: 'recipes',
    name: 'Rezeptverwaltung',
    description: 'Rezepte, Zutatenverbrauch und Kalkulation pro Artikel.',
    category: 'Speisen & Getraenke',
    defaultEnabled: true,
    systemLocked: false,
    sortOrder: 90,
  },
  {
    key: 'cost_of_goods',
    name: 'Wareneinsatz',
    description: 'Marge, Rezeptkosten und Wareneinsatz-Auswertungen.',
    category: 'Auswertungen',
    defaultEnabled: true,
    systemLocked: false,
    sortOrder: 100,
  },
  {
    key: 'daily_closing',
    name: 'Tagesabschluss',
    description: 'Tagesabschluss, Kassenabschluss und Exportvorbereitung.',
    category: 'Verkauf',
    defaultEnabled: true,
    systemLocked: false,
    sortOrder: 110,
  },
  {
    key: STAFF_MANAGEMENT_MODULE_KEY,
    name: 'Personalverwaltung',
    description: 'Dienstplanung, HR, Zeiterfassung und Mitarbeiterverwaltung.',
    category: 'Personal',
    defaultEnabled: true,
    systemLocked: false,
    sortOrder: 120,
  },
  {
    key: TIME_TRACKING_MODULE_KEY,
    name: 'Zeiterfassung',
    description: 'Einfache Stempeluhr fuer Mitarbeiter und Standortleiter.',
    category: 'Personal',
    defaultEnabled: true,
    systemLocked: false,
    sortOrder: 125,
  },
  {
    key: 'reporting',
    name: 'Reporting',
    description: 'Auswertungen, Kennzahlen und Management-Reports.',
    category: 'Auswertungen',
    defaultEnabled: true,
    systemLocked: false,
    sortOrder: 130,
  },
  {
    key: 'payments',
    name: 'Zahlungen',
    description: 'Zahlungsstatus, Zahlungsarten und Zahlungsauswertung.',
    category: 'Verkauf',
    defaultEnabled: true,
    systemLocked: false,
    sortOrder: 140,
  },
  {
    key: 'invoices',
    name: 'Rechnungen',
    description: 'Rechnungs- und Belegfunktionen fuer Bestellungen.',
    category: 'Verkauf',
    defaultEnabled: true,
    systemLocked: false,
    sortOrder: 150,
  },
  {
    key: 'cancellations',
    name: 'Stornos',
    description: 'Stornierungen, Stornogruende und Nachvollziehbarkeit.',
    category: 'Verkauf',
    defaultEnabled: true,
    systemLocked: false,
    sortOrder: 160,
  },
  {
    key: 'module_management',
    name: 'Modulverwaltung',
    description: 'Zentrale Steuerung der aktivierten Systemmodule.',
    category: 'Administration',
    defaultEnabled: true,
    systemLocked: true,
    sortOrder: 1000,
  },
];

export const MODULE_KEY_ALIASES: Record<string, string> = {
  tables: 'table_management',
  margins: 'cost_of_goods',
  daily_closings: 'daily_closing',
  staff: STAFF_MANAGEMENT_MODULE_KEY,
  timeTracking: TIME_TRACKING_MODULE_KEY,
};

export function normalizeModuleKey(key: string): string {
  return MODULE_KEY_ALIASES[key] ?? key;
}
