import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { AddressInfo } from 'node:net';
import { Model } from 'mongoose';
import { AppModule } from '../app.module';
import {
  AuditLog,
  AuditLogDocument,
} from '../audit-logs/schemas/audit-log.schema';
import { Tenant, TenantDocument } from './schemas/tenant.schema';

interface ApiResult<T> {
  status: number;
  body: T;
}

interface LoginBody {
  accessToken: string;
  user: {
    _id: string;
    email: string;
    roles?: string[];
    tenantId?: string;
  };
}

interface TenantBody {
  _id: string;
  name: string;
  slug: string;
  planKey?: string;
  planName?: string;
  monthlyPriceCents?: number;
  currency?: string;
  billingStatus?: string;
  billingEmail?: string;
}

interface BillingPlanBody {
  key: string;
  name: string;
  monthlyPriceCents: number;
  currency: string;
  billingInterval: string;
}

type ApiJson = Record<string, unknown> | Array<Record<string, unknown>>;

const platformCredentials = {
  email: 'platform@gastromania.local',
  password: 'Gastromania2026!',
};

const tenantAdminCredentials = {
  email: 'admin@frittenwerk-demo.demo',
  password: 'Demo2026!',
};

const expectedPlans = {
  basic: { name: 'Basic', monthlyPriceCents: 9000 },
  advance: { name: 'Advance', monthlyPriceCents: 30000 },
  pro: { name: 'Pro', monthlyPriceCents: 90000 },
} as const;

const expectedDemoTenantPlans = {
  burgermania: 'basic',
  'crispy-chicken': 'basic',
  'pasta-house': 'advance',
  'grill-factory': 'advance',
  'frittenwerk-demo': 'pro',
  'demo-test-tenant': 'basic',
} as const;

async function verifyTenantBilling() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn'],
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(0, '127.0.0.1');

  try {
    const address = app.getHttpServer().address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}/api`;
    const tenantModel = app.get<Model<TenantDocument>>(getModelToken(Tenant.name));
    const auditLogModel = app.get<Model<AuditLogDocument>>(
      getModelToken(AuditLog.name),
    );

    const platformLogin = await request<LoginBody>(
      baseUrl,
      'POST',
      '/auth/login',
      undefined,
      platformCredentials,
    );
    assertStatus(platformLogin, 201, 'Platform Admin Login');
    assert(
      platformLogin.body.user.roles?.includes('PlatformAdmin'),
      'Login liefert keine PlatformAdmin-Rolle',
    );
    const platformToken = platformLogin.body.accessToken;

    const planResult = await request<BillingPlanBody[]>(
      baseUrl,
      'GET',
      '/platform/billing/plans',
      platformToken,
    );
    assertStatus(planResult, 200, 'Tarifdefinitionen laden');
    for (const [key, expected] of Object.entries(expectedPlans)) {
      const plan = planResult.body.find((row) => row.key === key);
      if (!plan) {
        throw new Error(`Tarif ${key} fehlt`);
      }
      assert(plan.name === expected.name, `Tarifname ${key} stimmt nicht`);
      assert(
        plan.monthlyPriceCents === expected.monthlyPriceCents,
        `Tarifpreis ${key} stimmt nicht`,
      );
      assert(plan.currency === 'EUR', `Tarif ${key} ist nicht EUR`);
      assert(plan.billingInterval === 'monthly', `Tarif ${key} ist nicht monatlich`);
    }

    const tenants = await request<TenantBody[]>(
      baseUrl,
      'GET',
      '/platform/tenants',
      platformToken,
    );
    assertStatus(tenants, 200, 'Tenantliste laden');
    for (const [slug, expectedPlanKey] of Object.entries(expectedDemoTenantPlans)) {
      const tenant = tenants.body.find((row) => row.slug === slug);
      if (!tenant) {
        throw new Error(`Demo-Tenant ${slug} fehlt`);
      }
      assert(
        tenant.planKey === expectedPlanKey,
        `Demo-Tenant ${slug} hat falschen Tarif ${tenant.planKey}`,
      );
      assert(
        tenant.monthlyPriceCents === expectedPlans[expectedPlanKey].monthlyPriceCents,
        `Demo-Tenant ${slug} hat falschen Preis`,
      );
    }

    const frittenwerk = tenants.body.find(
      (tenant) => tenant.slug === 'frittenwerk-demo',
    );
    assert(frittenwerk, 'Frittenwerk Demo Tenant fehlt');

    const auditBefore = await auditLogModel
      .countDocuments({
        tenantId: frittenwerk._id,
        action: { $in: ['tenant.plan_changed', 'tenant.billing_updated'] },
      })
      .exec();

    const updateToAdvance = await request<TenantBody>(
      baseUrl,
      'PATCH',
      `/platform/tenants/${frittenwerk._id}/billing`,
      platformToken,
      {
        planKey: 'advance',
        billingStatus: 'active',
        billingEmail: 'billing@frittenwerk-demo.demo',
        billingNotes: 'Verify tenant billing',
      },
    );
    assertStatus(updateToAdvance, 200, 'Platform Admin Tarifwechsel');
    assert(updateToAdvance.body.planKey === 'advance', 'Tarif wurde nicht geaendert');
    assert(
      updateToAdvance.body.monthlyPriceCents === 30000,
      'Serverseitiger Advance-Preis wurde nicht gesetzt',
    );
    assert(updateToAdvance.body.currency === 'EUR', 'Currency ist nicht EUR');
    assert(
      updateToAdvance.body.billingStatus === 'active',
      'Billing-Status wurde nicht geaendert',
    );

    const invalidPlan = await request<ApiJson>(
      baseUrl,
      'PATCH',
      `/platform/tenants/${frittenwerk._id}/billing`,
      platformToken,
      { planKey: 'enterprise' },
    );
    assertStatus(invalidPlan, 400, 'Ungueltiger Tarif');

    const tenantAdminLogin = await request<LoginBody>(
      baseUrl,
      'POST',
      '/auth/login',
      undefined,
      tenantAdminCredentials,
    );
    assertStatus(tenantAdminLogin, 201, 'Tenant Admin Login');
    const tenantToken = tenantAdminLogin.body.accessToken;

    const tenantBlocked = await request<ApiJson>(
      baseUrl,
      'PATCH',
      `/platform/tenants/${frittenwerk._id}/billing`,
      tenantToken,
      { planKey: 'basic' },
    );
    assertStatus(tenantBlocked, 403, 'Tenant Admin darf Billing nicht aendern');

    const tenantSelf = await request<Record<string, unknown>>(
      baseUrl,
      'GET',
      '/tenant/me',
      tenantToken,
    );
    assertStatus(tenantSelf, 200, 'Tenant Self laden');
    assert(!('planKey' in tenantSelf.body), 'Tenant Self zeigt planKey');
    assert(
      !('monthlyPriceCents' in tenantSelf.body),
      'Tenant Self zeigt monthlyPriceCents',
    );
    assert(!('billingEmail' in tenantSelf.body), 'Tenant Self zeigt billingEmail');

    const restorePro = await request<TenantBody>(
      baseUrl,
      'PATCH',
      `/platform/tenants/${frittenwerk._id}/billing`,
      platformToken,
      {
        planKey: 'pro',
        billingStatus: 'active',
        billingEmail: 'billing@frittenwerk-demo.demo',
        billingNotes: 'Verify tenant billing restored',
      },
    );
    assertStatus(restorePro, 200, 'Frittenwerk Tarif wiederherstellen');
    assert(restorePro.body.planKey === 'pro', 'Frittenwerk Tarif wurde nicht wiederhergestellt');
    assert(restorePro.body.monthlyPriceCents === 90000, 'Pro-Preis wurde nicht wiederhergestellt');

    const auditAfter = await auditLogModel
      .countDocuments({
        tenantId: frittenwerk._id,
        action: { $in: ['tenant.plan_changed', 'tenant.billing_updated'] },
      })
      .exec();
    assert(auditAfter > auditBefore, 'Billing-Audit wurde nicht geschrieben');

    const persistedFrittenwerk = await tenantModel
      .findById(frittenwerk._id)
      .lean()
      .exec();
    assert(
      persistedFrittenwerk?.planKey === 'pro',
      'Persistierter Frittenwerk-Tarif ist nicht Pro',
    );

    console.log(
      JSON.stringify(
        {
          plans: planResult.body.map((plan) => ({
            key: plan.key,
            name: plan.name,
            monthlyPriceCents: plan.monthlyPriceCents,
            currency: plan.currency,
          })),
          demoTenantPlans: expectedDemoTenantPlans,
          platformAdminCanUpdateBilling: true,
          tenantAdminBillingPatchStatus: tenantBlocked.status,
          invalidPlanStatus: invalidPlan.status,
          tenantSelfBillingHidden: true,
          auditLogsAdded: auditAfter - auditBefore,
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
  }
}

async function request<T>(
  baseUrl: string,
  method: string,
  path: string,
  token?: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const parsed = text ? (JSON.parse(text) as T) : (undefined as T);

  return {
    status: response.status,
    body: parsed,
  };
}

function assertStatus<T>(
  result: ApiResult<T>,
  expectedStatus: number,
  label: string,
): void {
  assert(
    result.status === expectedStatus,
    `${label}: erwartet ${expectedStatus}, erhalten ${result.status} (${JSON.stringify(
      result.body,
    )})`,
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

void verifyTenantBilling();
