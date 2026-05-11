import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class ToggleChecklistTaskDto {
  @IsBoolean()
  isDone!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  note?: string;
}
