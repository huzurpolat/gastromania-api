import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Role } from '../../auth/enums/role.enum';

const trimString = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateDutyShiftDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  locationId!: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  employeeId!: string;

  @IsEnum(Role)
  role!: Role;

  @IsDateString()
  startTime!: string;

  @IsDateString()
  endTime!: string;

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  note?: string;
}
