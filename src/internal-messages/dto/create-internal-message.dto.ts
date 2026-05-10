import { IsEnum, IsMongoId, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Role } from '../../auth/enums/role.enum';
import { InternalMessagePriority } from '../schemas/internal-message.schema';

export class CreateInternalMessageDto {
  @IsMongoId()
  locationId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(800)
  message!: string;

  @IsOptional()
  @IsEnum(Role, { each: true })
  targetRoles?: Role[];

  @IsOptional()
  @IsEnum(InternalMessagePriority)
  priority?: InternalMessagePriority;
}
