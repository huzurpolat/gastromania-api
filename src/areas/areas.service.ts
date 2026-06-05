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
import { CreateAreaDto } from './dto/create-area.dto';
import { UpdateAreaDto } from './dto/update-area.dto';
import { Area, AreaDocument } from './schemas/area.schema';

@Injectable()
export class AreasService {
  constructor(
    @InjectModel(Area.name)
    private readonly areaModel: Model<AreaDocument>,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  async create(dto: CreateAreaDto, actor: AuthenticatedUser) {
    const tenantId = this.resolveTenantId(dto.tenantId, actor);

    return this.areaModel.create({
      ...dto,
      tenantId,
      companyId: dto.companyId ?? actor.companyId,
    });
  }

  async findAll(actor: AuthenticatedUser) {
    if (this.accessPolicy.isPlatformAdmin(actor)) {
      return this.areaModel.find().sort({ name: 1 }).exec();
    }

    if (!actor.tenantId) {
      return [];
    }

    if (actor.areaIds?.length) {
      return this.areaModel
        .find({ tenantId: actor.tenantId, _id: { $in: actor.areaIds } })
        .sort({ name: 1 })
        .exec();
    }

    if (this.accessPolicy.isCompanyAdmin(actor)) {
      return this.areaModel
        .find({ tenantId: actor.tenantId })
        .sort({ name: 1 })
        .exec();
    }

    return [];
  }

  async findOne(id: string, actor: AuthenticatedUser) {
    this.validateObjectId(id, 'Bereichs-ID');
    const area = await this.areaModel.findById(id).exec();

    if (!area || !this.canAccessArea(actor, area)) {
      throw new NotFoundException('Bereich nicht gefunden');
    }

    return area;
  }

  async update(id: string, dto: UpdateAreaDto, actor: AuthenticatedUser) {
    this.validateObjectId(id, 'Bereichs-ID');
    const area = await this.findOne(id, actor);

    if (
      !this.accessPolicy.isPlatformAdmin(actor) &&
      !this.accessPolicy.isCompanyAdmin(actor) &&
      !actor.areaIds?.includes(area._id.toString())
    ) {
      throw new ForbiddenException('Keine Berechtigung fuer diesen Bereich');
    }

    if (dto.tenantId !== undefined && dto.tenantId !== area.tenantId) {
      throw new BadRequestException('Tenant eines Bereichs darf nicht geaendert werden');
    }

    return this.areaModel
      .findByIdAndUpdate(id, dto, { new: true, runValidators: true })
      .exec();
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

  private canAccessArea(actor: AuthenticatedUser, area: AreaDocument): boolean {
    if (this.accessPolicy.isPlatformAdmin(actor)) {
      return true;
    }

    if (actor.tenantId !== area.tenantId) {
      return false;
    }

    return (
      this.accessPolicy.isCompanyAdmin(actor) ||
      Boolean(actor.areaIds?.includes(area._id.toString()))
    );
  }

  private validateObjectId(id: string, label: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Ungueltige ${label}`);
    }
  }
}
