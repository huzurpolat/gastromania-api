export const TENANT_BILLING_PLANS = {
  basic: {
    key: 'basic',
    name: 'Basic',
    monthlyPriceCents: 9000,
    currency: 'EUR',
    billingInterval: 'monthly',
    maxLocations: 1,
    maxUsers: 15,
  },
  advance: {
    key: 'advance',
    name: 'Advance',
    monthlyPriceCents: 30000,
    currency: 'EUR',
    billingInterval: 'monthly',
    maxLocations: 5,
    maxUsers: 75,
  },
  pro: {
    key: 'pro',
    name: 'Pro',
    monthlyPriceCents: 90000,
    currency: 'EUR',
    billingInterval: 'monthly',
    maxLocations: null,
    maxUsers: null,
  },
} as const;

export type TenantPlanKey = keyof typeof TENANT_BILLING_PLANS;

export const TENANT_PLAN_KEYS = Object.keys(
  TENANT_BILLING_PLANS,
) as TenantPlanKey[];

export type TenantBillingPlan = (typeof TENANT_BILLING_PLANS)[TenantPlanKey];

export function getTenantBillingPlan(planKey: string): TenantBillingPlan | undefined {
  return TENANT_BILLING_PLANS[planKey as TenantPlanKey];
}

export function isTenantPlanKey(planKey: string): planKey is TenantPlanKey {
  return planKey in TENANT_BILLING_PLANS;
}
