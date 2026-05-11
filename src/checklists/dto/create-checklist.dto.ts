import {
  IsArray,
  ArrayMinSize,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Role } from '../../auth/enums/role.enum';

export class CreateChecklistTaskDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  note?: string;
}

export class CreateChecklistDto {
  @IsMongoId()
  locationId!: string;

  @IsDateString()
  date!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(140)
  title!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  area!: string;

  @IsOptional()
  @IsEnum(Role, { each: true })
  roles?: Role[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateChecklistTaskDto)
  tasks!: CreateChecklistTaskDto[];

  @IsOptional()
  @IsString()
  @MaxLength(600)
  note?: string;
}
