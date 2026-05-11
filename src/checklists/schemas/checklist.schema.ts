import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { Role } from '../../auth/enums/role.enum';

export type ChecklistDocument = HydratedDocument<Checklist>;

export enum ChecklistStatus {
  Open = 'Offen',
  InProgress = 'In Arbeit',
  Done = 'Erledigt',
}

@Schema({ _id: true })
export class ChecklistTask {
  _id?: string;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ trim: true })
  note?: string;

  @Prop({ default: false })
  isDone!: boolean;

  @Prop({ trim: true })
  doneBy?: string;

  @Prop()
  doneAt?: Date;
}

export const ChecklistTaskSchema = SchemaFactory.createForClass(ChecklistTask);

@Schema({ timestamps: true, versionKey: false })
export class Checklist {
  @Prop({ required: true, trim: true, index: true })
  locationId!: string;

  @Prop({ required: true, index: true })
  date!: Date;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ trim: true, index: true })
  templateKey?: string;

  @Prop({ required: true, trim: true, index: true })
  area!: string;

  @Prop({ type: [String], enum: Object.values(Role), default: [] })
  roles!: Role[];

  @Prop({
    enum: ChecklistStatus,
    default: ChecklistStatus.Open,
    index: true,
  })
  status!: ChecklistStatus;

  @Prop({ type: [ChecklistTaskSchema], default: [] })
  tasks!: ChecklistTask[];

  @Prop({ trim: true })
  note?: string;
}

export const ChecklistSchema = SchemaFactory.createForClass(Checklist);

ChecklistSchema.index({ locationId: 1, date: 1, area: 1, title: 1 });
ChecklistSchema.index({ locationId: 1, date: 1, templateKey: 1 });
