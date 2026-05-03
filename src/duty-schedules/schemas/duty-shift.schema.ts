import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { Role } from '../../auth/enums/role.enum';

export type DutyShiftDocument = HydratedDocument<DutyShift>;

@Schema({ timestamps: true, versionKey: false })
export class DutyShift {
  @Prop({ required: true, trim: true, index: true })
  locationId!: string;

  @Prop({ required: true, trim: true, index: true })
  employeeId!: string;

  @Prop({ required: true, enum: Object.values(Role), index: true })
  role!: Role;

  @Prop({ required: true, index: true })
  startTime!: Date;

  @Prop({ required: true, index: true })
  endTime!: Date;

  @Prop({ trim: true })
  note?: string;
}

export const DutyShiftSchema = SchemaFactory.createForClass(DutyShift);

DutyShiftSchema.index({ locationId: 1, startTime: 1 });
DutyShiftSchema.index({ employeeId: 1, startTime: 1 });
