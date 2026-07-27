import { IsISO8601, IsMongoId, IsOptional } from 'class-validator';

export class ConvertWaitlistEntryDto {
  @IsISO8601()
  startTime!: string;

  @IsISO8601()
  endTime!: string;

  @IsOptional()
  @IsMongoId()
  tableId?: string;
}
