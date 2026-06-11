import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AccessPolicyService } from '../access/access-policy.service';
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import {
  StockItem,
  StockItemDocument,
} from '../stock/schemas/stock-item.schema';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import {
  MenuItem,
  MenuItemDocument,
  MenuItemExtra,
} from './schemas/menu-item.schema';

@Injectable()
export class MenuItemsService {
  constructor(
    @InjectModel(MenuItem.name)
    private readonly menuItemModel: Model<MenuItemDocument>,
    @InjectModel(StockItem.name)
    private readonly stockItemModel: Model<StockItemDocument>,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  async create(
    createMenuItemDto: CreateMenuItemDto,
    actor: AuthenticatedUser,
  ): Promise<MenuItemDocument> {
    this.assertManagementActor(actor);

    try {
      return await this.menuItemModel.create({
        ...createMenuItemDto,
        extras: await this.normalizeExtras(createMenuItemDto.extras, actor),
      });
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException(
          'Artikel mit diesem Namen existiert bereits in dieser Kategorie',
        );
      }

      throw error;
    }
  }

  async findAll(actor: AuthenticatedUser): Promise<MenuItemDocument[]> {
    void actor;
    return this.menuItemModel
      .find()
      .sort({ sortOrder: 1, category: 1, name: 1 })
      .exec();
  }

  async findOne(
    id: string,
    actor?: AuthenticatedUser,
  ): Promise<MenuItemDocument> {
    void actor;
    this.validateObjectId(id);

    const menuItem = await this.menuItemModel.findById(id).exec();

    if (!menuItem) {
      throw new NotFoundException('Artikel nicht gefunden');
    }

    return menuItem;
  }

  async update(
    id: string,
    updateMenuItemDto: UpdateMenuItemDto,
    actor: AuthenticatedUser,
  ): Promise<MenuItemDocument> {
    this.assertManagementActor(actor);
    this.validateObjectId(id);

    try {
      const updatePayload = {
        ...updateMenuItemDto,
        ...(updateMenuItemDto.extras !== undefined
          ? { extras: await this.normalizeExtras(updateMenuItemDto.extras, actor) }
          : {}),
      };
      const updatedMenuItem = await this.menuItemModel
        .findByIdAndUpdate(id, updatePayload, {
          returnDocument: 'after',
          runValidators: true,
        })
        .exec();

      if (!updatedMenuItem) {
        throw new NotFoundException('Artikel nicht gefunden');
      }

      return updatedMenuItem;
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException(
          'Artikel mit diesem Namen existiert bereits in dieser Kategorie',
        );
      }

      throw error;
    }
  }

  async remove(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<MenuItemDocument> {
    this.assertManagementActor(actor);
    this.validateObjectId(id);

    const deletedMenuItem = await this.menuItemModel
      .findByIdAndDelete(id)
      .exec();

    if (!deletedMenuItem) {
      throw new NotFoundException('Artikel nicht gefunden');
    }

    return deletedMenuItem;
  }

  private validateObjectId(id: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Ungueltige Artikel-ID');
    }
  }

  private assertManagementActor(actor: AuthenticatedUser): void {
    if (!this.accessPolicy.isManagementRole(actor)) {
      throw new BadRequestException(
        'Globale Speisekartenpflege ist Management vorbehalten',
      );
    }
  }

  private normalizeExtras(
    extras: CreateMenuItemDto['extras'] | UpdateMenuItemDto['extras'],
    actor: AuthenticatedUser,
  ): Promise<MenuItemExtra[]> {
    if (!extras?.length) {
      return Promise.resolve([]);
    }

    const seenIds = new Set<string>();

    return Promise.all(extras.map(async (extra, index) => {
      const id = extra.id?.trim() || randomUUID();

      if (seenIds.has(id)) {
        throw new BadRequestException(
          `Doppelte Zusatzoption-ID ${id} ist nicht erlaubt`,
        );
      }
      seenIds.add(id);
      const inventoryImpact = await this.normalizeInventoryImpact(
        extra.inventoryImpact ?? [],
        actor,
        extra.name,
      );

      return {
        id,
        name: extra.name.trim(),
        priceDelta: this.roundMoney(extra.priceDelta ?? 0),
        isAvailable: extra.isAvailable ?? true,
        sendToKitchen: extra.sendToKitchen ?? true,
        sortOrder: extra.sortOrder ?? index + 1,
        inventoryImpact,
      };
    }));
  }

  private async normalizeInventoryImpact(
    inventoryImpact: NonNullable<CreateMenuItemDto['extras']>[number]['inventoryImpact'],
    actor: AuthenticatedUser,
    extraName: string,
  ): Promise<MenuItemExtra['inventoryImpact']> {
    if (!inventoryImpact?.length) {
      return [];
    }

    const normalized: MenuItemExtra['inventoryImpact'] = [];

    for (const impact of inventoryImpact) {
      const stockItemId = impact.stockItemId.trim();

      if (!Types.ObjectId.isValid(stockItemId)) {
        throw new BadRequestException(
          `Ungueltige Lagerartikel-ID fuer Zusatzoption ${extraName}`,
        );
      }

      const stockItem = await this.stockItemModel.findById(stockItemId).exec();

      if (!stockItem || stockItem.isArchived || stockItem.isActive === false) {
        throw new BadRequestException(
          `Lagerartikel fuer Zusatzoption ${extraName} wurde nicht gefunden`,
        );
      }

      if (
        actor.tenantId &&
        stockItem.tenantId &&
        actor.tenantId !== stockItem.tenantId
      ) {
        throw new BadRequestException(
          `Lagerartikel ${stockItem.name} gehoert nicht zum Tenant`,
        );
      }

      if (!(await this.accessPolicy.canAccessLocation(actor, stockItem.locationId))) {
        throw new BadRequestException(
          `Lagerartikel ${stockItem.name} gehoert nicht zu einem erlaubten Standort`,
        );
      }

      if (Number(impact.quantity) <= 0) {
        throw new BadRequestException(
          `Lagerverbrauch fuer Zusatzoption ${extraName} muss groesser als 0 sein`,
        );
      }

      normalized.push({
        stockItemId,
        stockItemName: stockItem.name,
        quantity: Number(impact.quantity),
        unit: impact.unit.trim() || stockItem.unit,
      });
    }

    return normalized;
  }

  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
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
