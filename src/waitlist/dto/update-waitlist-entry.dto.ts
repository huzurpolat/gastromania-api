import { PartialType } from '@nestjs/mapped-types';
import { CreateWaitlistEntryDto } from './create-waitlist-entry.dto';

export class UpdateWaitlistEntryDto extends PartialType(
  CreateWaitlistEntryDto,
) {}
