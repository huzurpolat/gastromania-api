import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AccessPolicyService } from '../access/access-policy.service';
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { Department, DepartmentDocument } from './schemas/department.schema';

@Injectable()
export class DepartmentsService {
  constructor(
    @InjectModel(Department.name)
    private readonly departmentModel: Model<DepartmentDocument>,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  async create(
    dto: CreateDepartmentDto,
    actor: AuthenticatedUser,
  ): Promise<DepartmentDocument> {
    await this.accessPolicy.assertCanManageLocation(actor, dto.locationId);
    await this.accessPolicy.assertAssignableScope(actor, {
      companyId: dto.companyId,
      locationId: dto.locationId,
    });

    const department = await this.departmentModel
      .findOneAndUpdate(
        {
          companyId: dto.companyId,
          locationId: dto.locationId,
          type: dto.type,
        },
        { $set: { ...dto, isActive: dto.isActive ?? true } },
        { returnDocument: 'after', upsert: true, runValidators: true },
      )
      .exec();

    if (!department) {
      throw new NotFoundException('Department nicht gefunden');
    }

    return department;
  }

  async findAll(
    actor: AuthenticatedUser,
    locationId?: string,
  ): Promise<DepartmentDocument[]> {
    const filter = await this.accessPolicy.getScopedResourceFilter(
      actor,
      locationId,
    );

    return this.departmentModel.find(filter).sort({ name: 1 }).exec();
  }

  async update(
    id: string,
    dto: UpdateDepartmentDto,
    actor: AuthenticatedUser,
  ): Promise<DepartmentDocument> {
    const department = await this.departmentModel.findById(id).exec();

    if (!department) {
      throw new NotFoundException('Department nicht gefunden');
    }

    await this.accessPolicy.assertCanManageLocation(
      actor,
      department.locationId,
    );

    if (dto.locationId) {
      await this.accessPolicy.assertCanManageLocation(actor, dto.locationId);
    }

    department.set(dto);
    return department.save();
  }
}
