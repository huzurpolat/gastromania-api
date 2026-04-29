import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import { MenuItem, MenuItemDocument } from './schemas/menu-item.schema';

@Injectable()
export class MenuItemsService {
  constructor(
    @InjectModel(MenuItem.name)
    private readonly menuItemModel: Model<MenuItemDocument>,
  ) {}

  async create(
    createMenuItemDto: CreateMenuItemDto,
  ): Promise<MenuItemDocument> {
    try {
      return await this.menuItemModel.create(createMenuItemDto);
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException(
          'Artikel mit diesem Namen existiert bereits in dieser Kategorie',
        );
      }

      throw error;
    }
  }

  async findAll(): Promise<MenuItemDocument[]> {
    return this.menuItemModel.find().sort({ category: 1, name: 1 }).exec();
  }

  async findOne(id: string): Promise<MenuItemDocument> {
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
  ): Promise<MenuItemDocument> {
    this.validateObjectId(id);

    try {
      const updatedMenuItem = await this.menuItemModel
        .findByIdAndUpdate(id, updateMenuItemDto, {
          new: true,
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

  async remove(id: string): Promise<MenuItemDocument> {
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

  private isDuplicateKeyError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    );
  }
}
