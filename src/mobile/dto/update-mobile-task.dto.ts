import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateMobileTaskDto {
  @IsBoolean()
  isDone!: boolean;

  @IsOptional()
  @IsString()
  note?: string;
}
