const SENSITIVE_KEY_PATTERN =
  /(password|passwordHash|hash|token|refreshToken|resetToken|secret|apiKey|api_key)/i;

const ACTION_MAP: Record<string, string> = {
  'user.created': 'USER_CREATED',
  'user.updated': 'USER_UPDATED',
  'user.soft_deleted': 'USER_DISABLED',
  'tenant_user.password_reset': 'PASSWORD_RESET',
  'tenant_user.disabled': 'USER_DISABLED',
  'tenant_user.activated': 'USER_ENABLED',
  'tenant_user.soft_deleted': 'USER_DISABLED',
  'tenant_user.deleted': 'USER_DELETED',
  'tenant_user.cross_tenant_delete_blocked': 'CROSS_TENANT_DELETE_BLOCKED',
  'platform.user.updated': 'USER_UPDATED',
  'platform.user.password_reset': 'PASSWORD_RESET',
  'platform.user.suspended': 'ACCOUNT_LOCKED',
  'platform.user.deactivated': 'USER_DISABLED',
  'platform.user.activated': 'USER_ENABLED',
  'platform.tenant_user.deleted': 'USER_DELETED',
  'tenant_admin.created': 'USER_CREATED',
  'tenant_admin.updated': 'USER_UPDATED',
  'tenant_admin.password_reset': 'PASSWORD_RESET',
  'tenant_admin.disabled': 'USER_DISABLED',
  'tenant_admin.activated': 'USER_ENABLED',
  'tenant.created': 'TENANT_CREATED',
  'tenant.updated': 'TENANT_UPDATED',
  'tenant.soft_deleted': 'TENANT_DISABLED',
  'tenant.status_changed': 'TENANT_UPDATED',
  'reservation.created': 'RESERVATION_CREATED',
  'reservation.cancelled': 'RESERVATION_CANCELLED',
  'marketing.campaign.created': 'CAMPAIGN_CREATED',
  'marketing.campaign.updated': 'CAMPAIGN_UPDATED',
};

const CATEGORY_BY_ACTION_PREFIX: Array<[RegExp, string]> = [
  [/^(USER_|PASSWORD_|ACCOUNT_)/, 'USER'],
  [/^ROLE_/, 'ROLE'],
  [/^PERMISSION_/, 'PERMISSION'],
  [/^TENANT_/, 'TENANT'],
  [/^LOCATION_/, 'LOCATION'],
  [/^AREA_/, 'AREA'],
  [/^REGION_/, 'REGION'],
  [/^RESERVATION_/, 'RESERVATION'],
  [/^WAITLIST_/, 'WAITLIST'],
  [/^GUEST_/, 'GUEST'],
  [/^LOYALTY_/, 'LOYALTY'],
  [/^CAMPAIGN_|^MARKETING_/, 'MARKETING'],
  [/^LOGIN_|^PERMISSION_DENIED$/, 'SYSTEM'],
];

export function normalizeAuditAction(action: string): string {
  return ACTION_MAP[action] ?? action;
}

export function inferAuditCategory(action: string, entityType?: string): string {
  const normalizedAction = normalizeAuditAction(action);
  const match = CATEGORY_BY_ACTION_PREFIX.find(([pattern]) =>
    pattern.test(normalizedAction),
  );
  if (match) return match[1];

  switch ((entityType ?? '').toLowerCase()) {
    case 'user':
      return 'USER';
    case 'tenant':
      return 'TENANT';
    case 'location':
      return 'LOCATION';
    case 'area':
      return 'AREA';
    case 'region':
      return 'REGION';
    case 'reservation':
      return 'RESERVATION';
    case 'waitlist':
      return 'WAITLIST';
    case 'guest':
      return 'GUEST';
    case 'loyalty':
      return 'LOYALTY';
    case 'campaign':
    case 'marketing':
      return 'MARKETING';
    default:
      return 'SYSTEM';
  }
}

export function sanitizeAuditValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeAuditValue(entry)) as T;
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    sanitized[key] = SENSITIVE_KEY_PATTERN.test(key)
      ? '[MASKED]'
      : sanitizeAuditValue(entry);
  }

  return sanitized as T;
}
