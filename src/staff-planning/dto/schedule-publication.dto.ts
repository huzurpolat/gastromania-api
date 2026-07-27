import { Type } from 'class-transformer';
import { IsInt, IsString, Max, Min } from 'class-validator';

export class StaffSchedulePublicationQueryDto {
  @IsString()
  locationId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(53)
  week!: number;

  @Type(() => Number)
  @IsInt()
  @Min(2000)
  year!: number;
}

export class PublishStaffScheduleDto extends StaffSchedulePublicationQueryDto {}

export class StaffMyScheduleQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(53)
  week!: number;

  @Type(() => Number)
  @IsInt()
  @Min(2000)
  year!: number;
}
