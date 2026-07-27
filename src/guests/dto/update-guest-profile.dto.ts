import { PartialType } from '@nestjs/mapped-types';
import { CreateGuestProfileDto } from './create-guest-profile.dto';

export class UpdateGuestProfileDto extends PartialType(CreateGuestProfileDto) {}
