export interface PermissionDefinition {
  key: string;
  module: string;
  resource: string;
  action: string;
  description: string;
}

const modules = {
  dashboard: ['view'],
  users: ['view', 'create', 'update', 'delete', 'own.view', 'own.update'],
  roles: ['view', 'create', 'update', 'delete', 'permissions.update'],
  locations: ['view', 'create', 'update', 'delete'],
  orders: ['view', 'create', 'update', 'cancel'],
  kds: ['view', 'manage'],
  reservations: ['view', 'create', 'update', 'delete'],
  inventory: [
    'view',
    'create',
    'update',
    'delete',
    'stock.adjust',
    'inventory.manage',
  ],
  suppliers: ['view', 'create', 'update', 'delete'],
  menuItems: ['view', 'create', 'update', 'delete'],
  categories: ['view', 'create', 'update', 'delete'],
  tasks: ['view', 'create', 'update', 'delete'],
  employees: ['view', 'create', 'update', 'delete'],
  reports: ['view', 'export'],
  analytics: ['view'],
  finance: ['view', 'update'],
  accounting: ['view', 'update'],
  marketing: ['view', 'update'],
  customers: ['view', 'create', 'update', 'delete'],
  settings: ['view', 'update'],
  audit: ['view'],
} satisfies Record<string, string[]>;

export const PERMISSION_DEFINITIONS: PermissionDefinition[] = Object.entries(
  modules,
).flatMap(([module, actions]) =>
  actions.map((action) => ({
    key: `${module}.${action}`,
    module,
    resource: module,
    action,
    description: `${module}.${action}`,
  })),
);

export const ALL_PERMISSIONS = PERMISSION_DEFINITIONS.map(
  (permission) => permission.key,
);

export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  'Super Admin': ['*'],
  Admin: ALL_PERMISSIONS,
  Filialleiter: ALL_PERMISSIONS.filter(
    (permission) =>
      !permission.startsWith('roles.delete') &&
      !permission.startsWith('settings.update'),
  ),
  Restaurantleiter: [
    'dashboard.view',
    'users.view',
    'orders.view',
    'orders.update',
    'kds.view',
    'kds.manage',
    'inventory.view',
    'suppliers.view',
    'reports.view',
    'analytics.view',
  ],
  Schichtleiter: [
    'dashboard.view',
    'orders.view',
    'orders.update',
    'kds.view',
    'kds.manage',
    'tasks.view',
  ],
  Service: [
    'dashboard.view',
    'orders.view',
    'orders.create',
    'orders.update',
    'reservations.view',
    'reservations.create',
    'kds.view',
    'users.own.view',
    'users.own.update',
  ],
  Küche: [
    'dashboard.view',
    'orders.view',
    'kds.view',
    'kds.manage',
    'inventory.view',
  ],
  Bar: ['dashboard.view', 'orders.view', 'kds.view', 'kds.manage'],
  Theke: ['dashboard.view', 'orders.view', 'kds.view', 'kds.manage'],
  Lager: [
    'dashboard.view',
    'inventory.view',
    'inventory.create',
    'inventory.update',
    'inventory.stock.adjust',
    'suppliers.view',
  ],
  Einkauf: [
    'dashboard.view',
    'inventory.view',
    'suppliers.view',
    'suppliers.create',
    'suppliers.update',
    'reports.view',
  ],
  Buchhaltung: [
    'dashboard.view',
    'finance.view',
    'accounting.view',
    'reports.view',
    'reports.export',
  ],
  Marketing: [
    'dashboard.view',
    'marketing.view',
    'marketing.update',
    'customers.view',
  ],
  Personalabteilung: ['dashboard.view', 'employees.view', 'users.view'],
  Reinigung: [
    'dashboard.view',
    'tasks.view',
    'users.own.view',
    'users.own.update',
  ],
  Eventmanager: [
    'dashboard.view',
    'reservations.view',
    'reservations.create',
    'marketing.view',
  ],
  Kunde: ['dashboard.view', 'users.own.view', 'users.own.update'],
  Tellerwäscher: [
    'dashboard.view',
    'tasks.view',
    'users.own.view',
    'users.own.update',
  ],
};
