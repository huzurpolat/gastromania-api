import { IsIn } from 'class-validator';

export const platformUserStatuses = ['active', 'suspended', 'inactive'] as const;

export type PlatformUserStatus = (typeof platformUserStatuses)[number];

export class PlatformUserStatusDto {
  @IsIn(platformUserStatuses)
  status!: PlatformUserStatus;
}
