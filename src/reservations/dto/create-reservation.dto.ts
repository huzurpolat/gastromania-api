import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import {
  ReservationSource,
  ReservationStatus,
} from '../schemas/reservation.schema';

const trimString = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim() : value;

const optionalTrimString = (value: unknown): unknown => {
  const trimmedValue = trimString(value);

  return trimmedValue === '' ? undefined : trimmedValue;
};

const statusAliases: Record<string, ReservationStatus> = {
  Angefragt: ReservationStatus.Reserved,
  'Bestätigt': ReservationStatus.Confirmed,
  'BestÃ¤tigt': ReservationStatus.Confirmed,
  Eingecheckt: ReservationStatus.CheckedIn,
  Storniert: ReservationStatus.Cancelled,
  NoShow: ReservationStatus.NoShow,
};

const normalizeStatus = (value: unknown): unknown =>
  typeof value === 'string' ? statusAliases[value] ?? value : value;

export class CreateReservationDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  guestName!: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  guestPhone?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  phone?: string;

  @Transform(({ value }) => {
    const trimmedValue = optionalTrimString(value);

    return typeof trimmedValue === 'string'
      ? trimmedValue.toLowerCase()
      : trimmedValue;
  })
  @IsOptional()
  @IsEmail()
  guestEmail?: string;

  @Transform(({ value }) => {
    const trimmedValue = optionalTrimString(value);

    return typeof trimmedValue === 'string'
      ? trimmedValue.toLowerCase()
      : trimmedValue;
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  locationId!: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  tableId?: string;

  @IsInt()
  @Min(1)
  partySize!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  guestCount?: number;

  @IsDateString()
  startTime!: string;

  @IsDateString()
  endTime!: string;

  @Transform(({ value }) => normalizeStatus(value))
  @IsOptional()
  @IsEnum(ReservationStatus)
  status?: ReservationStatus;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  notes?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsEnum(ReservationSource)
  source?: ReservationSource;
}
