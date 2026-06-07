import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from '../../auth/types/authenticated-request.type';
import { REQUIRE_MODULE_KEY } from '../decorators/require-module.decorator';
import { ModulesService } from '../modules.service';

@Injectable()
export class ModuleEnabledGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly modulesService: ModulesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const moduleKey = this.reflector.getAllAndOverride<string | string[]>(
      REQUIRE_MODULE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!moduleKey) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const moduleKeys = Array.isArray(moduleKey) ? moduleKey : [moduleKey];

    for (const requiredModule of moduleKeys) {
      await this.modulesService.assertEnabled(requiredModule, request.user);
    }

    return true;
  }
}
