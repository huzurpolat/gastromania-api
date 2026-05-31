import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
} from './permissions.catalog';

function controllerFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    const stats = statSync(path);

    if (stats.isDirectory()) {
      return controllerFiles(path);
    }

    return path.endsWith('.controller.ts') ? [path] : [];
  });
}

describe('permissions catalog', () => {
  it('contains every permission used by backend controllers', () => {
    const knownPermissions = new Set(ALL_PERMISSIONS);
    const usedPermissions = controllerFiles(join(__dirname, '..'))
      .flatMap((file) => {
        const source = readFileSync(file, 'utf8');
        return [...source.matchAll(/@Permissions\('([^']+)'\)/g)].map(
          (match) => match[1],
        );
      })
      .filter((permission) => permission !== '*');

    expect(usedPermissions).not.toHaveLength(0);
    expect(
      usedPermissions.filter((permission) => !knownPermissions.has(permission)),
    ).toEqual([]);
  });

  it('keeps default role permissions canonical and known', () => {
    const knownPermissions = new Set([...ALL_PERMISSIONS, '*']);

    expect(Object.keys(DEFAULT_ROLE_PERMISSIONS)).toContain('Küche');
    expect(Object.keys(DEFAULT_ROLE_PERMISSIONS)).toContain('Tellerwäscher');
    expect(Object.keys(DEFAULT_ROLE_PERMISSIONS)).toContain('RegionAdmin');
    expect(Object.keys(DEFAULT_ROLE_PERMISSIONS)).toContain('Bereichsleiter');
    expect(Object.keys(DEFAULT_ROLE_PERMISSIONS)).not.toContain('Kueche');
    expect(Object.keys(DEFAULT_ROLE_PERMISSIONS)).not.toContain('Tellerwaescher');

    const invalidPermissions = Object.values(DEFAULT_ROLE_PERMISSIONS)
      .flat()
      .filter((permission) => !knownPermissions.has(permission));

    expect(invalidPermissions).toEqual([]);
  });
});
