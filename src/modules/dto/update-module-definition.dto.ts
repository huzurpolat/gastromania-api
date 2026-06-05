import { IsBoolean, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class UpdateModuleDefinitionDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  description?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  category?: string;

  @IsOptional()
  @IsBoolean()
  defaultEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  systemLocked?: boolean;

  @IsOptional()
  @Min(0)
  sortOrder?: number;
}
