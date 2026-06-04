import { IsBoolean } from 'class-validator';

export class UpdateModuleDto {
  @IsBoolean()
  enabled!: boolean;
}
