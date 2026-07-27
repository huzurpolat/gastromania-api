import { PartialType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import {
  CreateUserDto,
  UserLocationAssignmentDto,
} from './create-user.dto';

const emptyArrayToUndefined = ({ value }: { value: unknown }): unknown =>
  Array.isArray(value) && value.length === 0 ? undefined : value;

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @IsOptional()
  @IsString()
  locationId?: string;

  @Transform(emptyArrayToUndefined)
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  locationIds?: string[];

  @Transform(emptyArrayToUndefined)
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => UserLocationAssignmentDto)
  locationAssignments?: UserLocationAssignmentDto[];

  @Transform(emptyArrayToUndefined)
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  managedLocationIds?: string[];
}
