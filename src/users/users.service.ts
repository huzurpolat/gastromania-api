import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import bcrypt from 'bcrypt';
import { Model, Types } from 'mongoose';
import { Role } from '../auth/enums/role.enum';
import { CreateUserDto } from './dto/create-user.dto';
import {
  toUserResponse,
  User,
  UserDocument,
  UserResponse,
} from './schemas/user.schema';

@Injectable()
export class UsersService {
  private readonly passwordSaltRounds = 12;

  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async create(
    createUserDto: CreateUserDto,
    rolesOverride?: Role[],
  ): Promise<UserResponse> {
    const passwordHash = await bcrypt.hash(
      createUserDto.password,
      this.passwordSaltRounds,
    );

    try {
      const user = await this.userModel.create({
        email: createUserDto.email,
        passwordHash,
        firstName: createUserDto.firstName,
        lastName: createUserDto.lastName,
        roles: rolesOverride ?? createUserDto.roles,
        isActive: createUserDto.isActive,
        locationId: createUserDto.locationId,
      });

      return toUserResponse(user);
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException(
          'Benutzer mit dieser E-Mail existiert bereits',
        );
      }

      throw error;
    }
  }

  async findAll(): Promise<UserResponse[]> {
    const users = await this.userModel.find().sort({ createdAt: -1 }).exec();

    return users.map((user) => toUserResponse(user));
  }

  async count(): Promise<number> {
    return this.userModel.countDocuments().exec();
  }

  async findById(id: string): Promise<UserResponse> {
    this.validateObjectId(id);

    const user = await this.userModel.findById(id).exec();

    if (!user) {
      throw new NotFoundException('Benutzer nicht gefunden');
    }

    return toUserResponse(user);
  }

  async findByEmail(email: string): Promise<UserResponse | null> {
    const user = await this.userModel
      .findOne({ email: email.toLowerCase() })
      .exec();

    return user ? toUserResponse(user) : null;
  }

  async findByEmailWithPassword(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: email.toLowerCase() }).exec();
  }

  private validateObjectId(id: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Ungueltige Benutzer-ID');
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
