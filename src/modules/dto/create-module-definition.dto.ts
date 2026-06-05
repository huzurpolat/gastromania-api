import { IsBoolean, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateModuleDefinitionDto {
  @IsString()
  @MinLength(2)
  key!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(2)
  description!: string;

  @IsString()
  @MinLength(2)
  category!: string;

  @IsBoolean()
  defaultEnabled!: boolean;

  @IsOptional()
  @IsBoolean()
  systemLocked?: boolean;

  @IsOptional()
  @Min(0)
  sortOrder?: number;
}
