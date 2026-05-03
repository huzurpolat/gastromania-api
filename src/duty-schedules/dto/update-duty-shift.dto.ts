import { PartialType } from '@nestjs/mapped-types';
import { CreateDutyShiftDto } from './create-duty-shift.dto';

export class UpdateDutyShiftDto extends PartialType(CreateDutyShiftDto) {}
