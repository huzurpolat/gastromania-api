import { IsBoolean } from 'class-validator';

export class UpdateTenantModuleDto {
  @IsBoolean()
  enabled!: boolean;
}
