import bcrypt from 'bcrypt';
import { existsSync, readFileSync } from 'fs';
import mongoose from 'mongoose';
import { resolve } from 'path';
import { Role } from '../auth/enums/role.enum';
import { User, UserSchema } from './schemas/user.schema';

const DEFAULT_EMAIL = 'platform@gastromania.local';
const DEFAULT_DEVELOPMENT_PASSWORD = 'Gastromania2026!';

function loadLocalEnv(): void {
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) {
    return;
  }

  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue;
    }
    const separatorIndex = trimmedLine.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    const value = trimmedLine
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '');

    process.env[key] ??= value;
  }
}

async function ensurePlatformAdmin(): Promise<void> {
  loadLocalEnv();

  const mongoUri =
    process.env.MONGODB_URI ?? 'mongodb://localhost:27017/gastromania';
  const email = (
    process.env.PLATFORM_ADMIN_EMAIL ?? DEFAULT_EMAIL
  )
    .trim()
    .toLowerCase();
  const password = process.env.PLATFORM_ADMIN_PASSWORD;

  if (process.env.NODE_ENV === 'production' && !password) {
    throw new Error(
      'PLATFORM_ADMIN_PASSWORD muss in production explizit gesetzt sein.',
    );
  }

  const effectivePassword = password ?? DEFAULT_DEVELOPMENT_PASSWORD;
  if (effectivePassword.length < 8) {
    throw new Error('PLATFORM_ADMIN_PASSWORD muss mindestens 8 Zeichen haben.');
  }

  await mongoose.connect(mongoUri);
  const userModel = mongoose.model(User.name, UserSchema);
  const existingUser = await userModel
    .findOne({ email })
    .select('permissionsVersion')
    .lean()
    .exec();
  const passwordHash = await bcrypt.hash(effectivePassword, 12);
  const nextPermissionsVersion = Math.max(
    Number(existingUser?.permissionsVersion ?? 1),
    1,
  ) + 1;

  const user = await userModel
    .findOneAndUpdate(
      { email },
      {
        $set: {
          email,
          passwordHash,
          firstName: 'Platform',
          lastName: 'Admin',
          roles: [Role.PlatformAdminCode],
          isActive: true,
          status: 'active',
          permissionsVersion: nextPermissionsVersion,
          areaIds: [],
          regionIds: [],
          locationIds: [],
          managedLocationIds: [],
          departmentIds: [],
          responsibilities: [],
        },
        $unset: {
          tenantId: '',
          companyId: '',
          locationId: '',
        },
      },
      {
        returnDocument: 'after',
        setDefaultsOnInsert: true,
        upsert: true,
      },
    )
    .lean()
    .exec();

  await mongoose.disconnect();

  console.log(
    `Platform Admin bereit: ${user?.email} (${existingUser ? 'aktualisiert' : 'erstellt'})`,
  );
}

ensurePlatformAdmin().catch(async (error) => {
  await mongoose.disconnect().catch(() => undefined);
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
