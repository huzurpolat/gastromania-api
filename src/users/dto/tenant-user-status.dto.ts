import { IsIn } from 'class-validator';

export const tenantUserStatuses = ['active', 'disabled'] as const;
export type TenantUserStatus = (typeof tenantUserStatuses)[number];

export class TenantUserStatusDto {
  @IsIn(tenantUserStatuses)
  status!: TenantUserStatus;
}
