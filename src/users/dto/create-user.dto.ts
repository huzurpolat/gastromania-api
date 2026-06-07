import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Role } from '../../auth/enums/role.enum';

const trimString = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim() : value;

const optionalTrimString = (value: unknown): unknown => {
  return trimString(value);
};

export const CONTRACT_TYPES = [
  'Vollzeit',
  'Teilzeit',
  'Minijob',
  'Werkstudent',
  'Aushilfe',
  'Freelancer',
  'Praktikant',
] as const;

export const EMPLOYEE_STATUSES = [
  'Im Dienst',
  'Frei',
  'Pause',
  'Krank',
  'Urlaub',
  'Inaktiv',
  'Gekuendigt',
] as const;

export const USER_ACCOUNT_STATUSES = ['active', 'invited', 'disabled'] as const;

export const QUALIFICATIONS = [
  'Service',
  'Küche',
  'Kueche',
  'Bar',
  'Theke',
  'Kasse',
  'Schichtleitung',
  'Lager',
  'Reinigung',
  'Lieferung',
  'Eventservice',
  'Sehr erfahren',
  'Erfahren',
  'Neuling',
  'Fuehrungskraft',
  'Junior-Fuehrungskraft',
  'Englischkenntnisse',
  'Spanischkenntnisse',
  'Barista',
  'Barkeeper',
  'Kuechenhilfe',
  'Koch',
  'Kassenberechtigt',
  'Hygieneschulung',
  'Erste Hilfe',
] as const;

export const USER_LOCATION_ASSIGNMENT_ROLES = [
  Role.LocationManager,
  Role.Waiter,
  Role.Kitchen,
  Role.Counter,
  Role.Cashier,
  Role.InventoryManager,
  Role.Dishwasher,
  Role.Staff,
] as const;

export const USER_LOCATION_ASSIGNMENT_ROLE_INPUTS = [
  ...USER_LOCATION_ASSIGNMENT_ROLES,
  Role.Filialleiter,
  Role.Restaurantleiter,
  Role.Service,
  Role.Kueche,
  'KÃ¼che',
  'KÃƒÂ¼che',
  'KÃƒÆ’Ã‚Â¼che',
  'Kueche',
  'Küche',
  Role.Theke,
  Role.Bar,
  Role.Kasse,
  Role.Lager,
  Role.Tellerwaescher,
  'TellerwÃ¤scher',
  'TellerwÃƒÂ¤scher',
  'Tellerwaescher',
  'Spuelkueche',
] as const;

export class UserLocationAssignmentDto {
  @Transform(({ value }) => optionalTrimString(value))
  @IsString()
  @IsNotEmpty()
  locationId!: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsString()
  @IsNotEmpty()
  @IsIn(USER_LOCATION_ASSIGNMENT_ROLE_INPUTS)
  role!: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class CreateUserDto {
  @Transform(({ value }) => {
    const trimmedValue = trimString(value);

    return typeof trimmedValue === 'string'
      ? trimmedValue.toLowerCase()
      : trimmedValue;
  })
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password!: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  firstName?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  lastName?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  phone?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  mobile?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  taxNumber?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  vatId?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  taxOffice?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  employeeNumber?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  address?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  street?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  zip?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  city?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsOptional()
  @IsDateString()
  hireDate?: string;

  @IsOptional()
  @IsDateString()
  terminationDate?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(QUALIFICATIONS, { each: true })
  qualifications?: string[];

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsIn(CONTRACT_TYPES)
  employmentType?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsIn(CONTRACT_TYPES)
  contractType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  weeklyHours?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  hourlyRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  monthlySalary?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  vacationDaysPerYear?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  remainingVacationDays?: number;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsIn(EMPLOYEE_STATUSES)
  employeeStatus?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  notes?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  profileImageUrl?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  roles?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsIn(USER_ACCOUNT_STATUSES)
  status?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  tenantId?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  areaIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  regionIds?: string[];

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  locationIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => UserLocationAssignmentDto)
  locationAssignments?: UserLocationAssignmentDto[];

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  managedLocationIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  departmentIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  responsibilities?: string[];
}
