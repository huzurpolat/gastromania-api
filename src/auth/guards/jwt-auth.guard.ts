import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { Model } from 'mongoose';
import {
  AuthenticatedRequest,
  AuthenticatedUser,
} from '../types/authenticated-request.type';
import { User, UserDocument } from '../../users/schemas/user.schema';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('Access Token fehlt');
    }

    try {
      request.user =
        await this.jwtService.verifyAsync<AuthenticatedUser>(token);
    } catch {
      throw new UnauthorizedException('Access Token ist ungueltig');
    }

    await this.assertSessionIsCurrent(request.user);

    return true;
  }

  private async assertSessionIsCurrent(user: AuthenticatedUser): Promise<void> {
    const currentUser = await this.userModel
      .findById(user.sub)
      .select('isActive status permissionsVersion')
      .lean()
      .exec();

    if (!currentUser || !currentUser.isActive || currentUser.status === 'disabled') {
      throw new UnauthorizedException('Benutzer ist deaktiviert');
    }

    const tokenVersion = Math.max(user.permissionsVersion ?? 1, 1);
    const currentVersion = Math.max(currentUser.permissionsVersion ?? 1, 1);

    if (tokenVersion !== currentVersion) {
      throw new UnauthorizedException(
        'Session permissions are outdated. Please login again.',
      );
    }
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];

    if (type === 'Bearer') {
      return token;
    }

    const queryToken = request.query.access_token;

    return typeof queryToken === 'string' ? queryToken : undefined;
  }
}
