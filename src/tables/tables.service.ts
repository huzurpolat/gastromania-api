import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AccessPolicyService } from '../access/access-policy.service';
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { CreateTableDto } from './dto/create-table.dto';
import { UpdateTableDto } from './dto/update-table.dto';
import {
  RestaurantTable,
  RestaurantTableDocument,
} from './schemas/table.schema';

@Injectable()
export class TablesService {
  constructor(
    @InjectModel(RestaurantTable.name)
    private readonly tableModel: Model<RestaurantTableDocument>,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  async create(
    createTableDto: CreateTableDto,
    actor: AuthenticatedUser,
  ): Promise<RestaurantTableDocument> {
    this.validateObjectId(createTableDto.locationId, 'Standort-ID');
    await this.accessPolicy.assertCanManageLocation(actor, createTableDto.locationId);

    try {
      return await this.tableModel.create(createTableDto);
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException(
          'Tisch mit diesem Namen existiert bereits an diesem Standort',
        );
      }

      throw error;
    }
  }

  async findAll(
    actor: AuthenticatedUser,
    locationId?: string,
  ): Promise<RestaurantTableDocument[]> {
    if (locationId) {
      this.validateObjectId(locationId, 'Standort-ID');
    }
    const scopeFilter = await this.accessPolicy.getScopedResourceFilter(actor, locationId);

    return this.tableModel
      .find(scopeFilter)
      .sort({ locationId: 1, name: 1 })
      .exec();
  }

  async findOne(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<RestaurantTableDocument> {
    this.validateObjectId(id, 'Tisch-ID');

    const table = await this.tableModel.findById(id).exec();

    if (
      !table ||
      !(await this.accessPolicy.canAccessLocation(actor, table.locationId))
    ) {
      throw new NotFoundException('Tisch nicht gefunden');
    }

    return table;
  }

  async update(
    id: string,
    updateTableDto: UpdateTableDto,
    actor: AuthenticatedUser,
  ): Promise<RestaurantTableDocument> {
    this.validateObjectId(id, 'Tisch-ID');
    const existing = await this.findOne(id, actor);
    await this.accessPolicy.assertCanManageLocation(actor, existing.locationId);

    if (updateTableDto.locationId) {
      this.validateObjectId(updateTableDto.locationId, 'Standort-ID');
      await this.accessPolicy.assertCanManageLocation(actor, updateTableDto.locationId);
    }

    try {
      const updatedTable = await this.tableModel
        .findByIdAndUpdate(id, updateTableDto, {
          new: true,
          runValidators: true,
        })
        .exec();

      if (!updatedTable) {
        throw new NotFoundException('Tisch nicht gefunden');
      }

      return updatedTable;
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException(
          'Tisch mit diesem Namen existiert bereits an diesem Standort',
        );
      }

      throw error;
    }
  }

  async remove(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<RestaurantTableDocument> {
    this.validateObjectId(id, 'Tisch-ID');
    const existing = await this.findOne(id, actor);
    await this.accessPolicy.assertCanManageLocation(actor, existing.locationId);

    const deletedTable = await this.tableModel.findByIdAndDelete(id).exec();

    if (!deletedTable) {
      throw new NotFoundException('Tisch nicht gefunden');
    }

    return deletedTable;
  }

  private validateObjectId(id: string, label: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Ungueltige ${label}`);
    }
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    );
  }
}
