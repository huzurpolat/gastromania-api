import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AccessPolicyService } from '../access/access-policy.service';
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { CreateRegionDto } from './dto/create-region.dto';
import { UpdateRegionDto } from './dto/update-region.dto';
import { Region, RegionDocument } from './schemas/region.schema';

@Injectable()
export class RegionsService {
  constructor(
    @InjectModel(Region.name)
    private readonly regionModel: Model<RegionDocument>,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  async create(dto: CreateRegionDto, actor: AuthenticatedUser) {
    const tenantId = this.resolveTenantId(dto.tenantId, actor);
    const payload = {
      ...dto,
      tenantId,
      companyId: dto.companyId ?? actor.companyId,
    };

    if (
      !this.accessPolicy.isPlatformAdmin(actor) &&
      payload.companyId &&
      !this.accessPolicy.canAccessCompany(actor, payload.companyId)
    ) {
      throw new ForbiddenException(
        'Keine Berechtigung fuer dieses Unternehmen',
      );
    }

    await this.accessPolicy.assertAssignableScope(actor, {
      tenantId,
      areaIds: payload.areaId ? [payload.areaId] : [],
      companyId: payload.companyId,
    });

    return this.regionModel.create(payload);
  }

  async findAll(actor: AuthenticatedUser) {
    if (this.accessPolicy.isPlatformAdmin(actor)) {
      return this.regionModel.find().sort({ name: 1 }).exec();
    }

    if (actor.regionIds?.length) {
      return this.regionModel
        .find({ tenantId: actor.tenantId, _id: { $in: actor.regionIds } })
        .sort({ name: 1 })
        .exec();
    }

    if (actor.areaIds?.length) {
      return this.regionModel
        .find({ tenantId: actor.tenantId, areaId: { $in: actor.areaIds } })
        .sort({ name: 1 })
        .exec();
    }

    if (actor.tenantId && this.accessPolicy.isCompanyAdmin(actor)) {
      return this.regionModel
        .find({ tenantId: actor.tenantId })
        .sort({ name: 1 })
        .exec();
    }

    if (actor.companyId) {
      return this.regionModel
        .find({ companyId: actor.companyId })
        .sort({ name: 1 })
        .exec();
    }

    return [];
  }

  async findOne(id: string, actor: AuthenticatedUser) {
    this.validateObjectId(id);
    if (!(await this.accessPolicy.canAccessRegion(actor, id))) {
      throw new NotFoundException('Region nicht gefunden');
    }

    const region = await this.regionModel.findById(id).exec();
    if (!region) {
      throw new NotFoundException('Region nicht gefunden');
    }

    return region;
  }

  async update(id: string, dto: UpdateRegionDto, actor: AuthenticatedUser) {
    this.validateObjectId(id);
    if (!(await this.accessPolicy.canAccessRegion(actor, id))) {
      throw new ForbiddenException('Keine Berechtigung fuer diese Region');
    }

    const region = await this.regionModel
      .findByIdAndUpdate(id, dto, { new: true, runValidators: true })
      .exec();
    if (!region) {
      throw new NotFoundException('Region nicht gefunden');
    }

    return region;
  }

  private validateObjectId(id: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Ungueltige Regions-ID');
    }
  }

  private resolveTenantId(
    requestedTenantId: string | undefined,
    actor: AuthenticatedUser,
  ): string {
    if (this.accessPolicy.isPlatformAdmin(actor)) {
      if (!requestedTenantId) {
        throw new BadRequestException('Tenant-ID ist erforderlich');
      }

      return requestedTenantId;
    }

    if (!actor.tenantId) {
      throw new ForbiddenException('Kein Tenant-Kontext vorhanden');
    }

    if (requestedTenantId && requestedTenantId !== actor.tenantId) {
      throw new ForbiddenException('Keine Berechtigung fuer diesen Tenant');
    }

    return actor.tenantId;
  }
}
