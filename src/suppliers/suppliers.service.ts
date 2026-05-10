import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Role } from '../auth/enums/role.enum';
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { Location, LocationDocument } from '../locations/schemas/location.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { Supplier, SupplierDocument } from './schemas/supplier.schema';

export interface SupplierResponse {
  _id: string;
  locationId: string;
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  website?: string;
  street?: string;
  zip?: string;
  city?: string;
  deliveryDays?: string;
  orderDeadline?: string;
  minimumOrderValue?: string;
  customerNumber?: string;
  note?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

@Injectable()
export class SuppliersService {
  constructor(
    @InjectModel(Supplier.name)
    private readonly supplierModel: Model<SupplierDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Location.name)
    private readonly locationModel: Model<LocationDocument>,
  ) {}

  async create(payload: CreateSupplierDto, actor: AuthenticatedUser): Promise<SupplierResponse> {
    await this.assertCanUseLocation(actor, payload.locationId);
    const supplier = await this.supplierModel.create(payload);
    return this.toResponse(supplier);
  }

  async findAll(actor: AuthenticatedUser, locationId?: string): Promise<SupplierResponse[]> {
    const locationIds = locationId ? [locationId] : await this.getReadableLocationIds(actor);
    await Promise.all(locationIds.map((id) => this.assertCanUseLocation(actor, id)));
    const suppliers = await this.supplierModel
      .find({ locationId: { $in: locationIds } })
      .sort({ name: 1 })
      .exec();
    return suppliers.map((supplier) => this.toResponse(supplier));
  }

  async update(id: string, payload: UpdateSupplierDto, actor: AuthenticatedUser): Promise<SupplierResponse> {
    const supplier = await this.supplierModel.findById(id).exec();
    if (!supplier) throw new NotFoundException('Lieferant nicht gefunden');
    await this.assertCanUseLocation(actor, supplier.locationId);
    if (payload.locationId && payload.locationId !== supplier.locationId) {
      await this.assertCanUseLocation(actor, payload.locationId);
    }
    supplier.set(payload);
    return this.toResponse(await supplier.save());
  }

  async remove(id: string, actor: AuthenticatedUser): Promise<SupplierResponse> {
    const supplier = await this.supplierModel.findById(id).exec();
    if (!supplier) throw new NotFoundException('Lieferant nicht gefunden');
    await this.assertCanUseLocation(actor, supplier.locationId);
    await this.supplierModel.deleteOne({ _id: id }).exec();
    return this.toResponse(supplier);
  }

  private async assertCanUseLocation(actor: AuthenticatedUser, locationId: string): Promise<void> {
    if (actor.roles.includes(Role.Admin)) return;
    const locationIds = await this.getReadableLocationIds(actor);
    if (!locationIds.includes(locationId)) {
      throw new ForbiddenException('Kein Zugriff auf diese Filiale');
    }
  }

  private async getReadableLocationIds(actor: AuthenticatedUser): Promise<string[]> {
    if (actor.roles.includes(Role.Admin)) {
      const locations = await this.locationModel.find().select('_id').exec();
      return locations.map((location) => location._id.toString());
    }
    const user = await this.userModel.findById(actor.sub).select('locationId locationIds').exec();
    const ownLocationIds = user
      ? [...new Set([...(user.locationIds ?? []), ...(user.locationId ? [user.locationId] : [])])].map((id) => id.toString())
      : [];
    const managedLocationIds = actor.roles.includes(Role.Filialleiter)
      ? await this.getManagedLocationIds(actor.sub)
      : [];
    return [...new Set([...ownLocationIds, ...managedLocationIds])];
  }

  private async getManagedLocationIds(managerId: string): Promise<string[]> {
    const locations = await this.locationModel.find({ managerId }).select('_id').exec();
    return locations.map((location) => location._id.toString());
  }

  private toResponse(supplier: SupplierDocument): SupplierResponse {
    const timestamped = supplier as SupplierDocument & { createdAt?: Date; updatedAt?: Date };
    return {
      _id: supplier._id.toString(),
      locationId: supplier.locationId,
      name: supplier.name,
      contactName: supplier.contactName,
      phone: supplier.phone,
      email: supplier.email,
      website: supplier.website,
      street: supplier.street,
      zip: supplier.zip,
      city: supplier.city,
      deliveryDays: supplier.deliveryDays,
      orderDeadline: supplier.orderDeadline,
      minimumOrderValue: supplier.minimumOrderValue,
      customerNumber: supplier.customerNumber,
      note: supplier.note,
      isActive: supplier.isActive,
      createdAt: timestamped.createdAt?.toISOString(),
      updatedAt: timestamped.updatedAt?.toISOString(),
    };
  }
}
