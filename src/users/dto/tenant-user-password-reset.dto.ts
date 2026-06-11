import { IsString, MinLength } from 'class-validator';

export class TenantUserPasswordResetDto {
  @IsString()
  @MinLength(8)
  newPassword!: string;
}
