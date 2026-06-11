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
        extras: this.normalizeExtras(createMenuItemDto.extras),
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
          ? { extras: this.normalizeExtras(updateMenuItemDto.extras) }
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
  ): MenuItemExtra[] {
    if (!extras?.length) {
      return [];
    }

    const seenIds = new Set<string>();

    return extras.map((extra, index) => {
      const id = extra.id?.trim() || randomUUID();

      if (seenIds.has(id)) {
        throw new BadRequestException(
          `Doppelte Zusatzoption-ID ${id} ist nicht erlaubt`,
        );
      }
      seenIds.add(id);

      return {
        id,
        name: extra.name.trim(),
        priceDelta: this.roundMoney(extra.priceDelta ?? 0),
        isAvailable: extra.isAvailable ?? true,
        sendToKitchen: extra.sendToKitchen ?? true,
        sortOrder: extra.sortOrder ?? index + 1,
      };
    });
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
