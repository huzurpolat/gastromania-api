import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccessModule } from '../access/access.module';
import { AuthJwtModule } from '../auth/auth-jwt.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { HrController } from './hr.controller';
import { HrService } from './hr.service';
import {
  EmployeeDocumentRecord,
  EmployeeDocumentRecordSchema,
} from './schemas/employee-document.schema';
import {
  EmployeeFeedback,
  EmployeeFeedbackSchema,
} from './schemas/employee-feedback.schema';
import {
  JobApplicant,
  JobApplicantSchema,
} from './schemas/job-applicant.schema';

@Module({
  imports: [
    AccessModule,
    AuthJwtModule,
    MongooseModule.forFeature([
      {
        name: EmployeeDocumentRecord.name,
        schema: EmployeeDocumentRecordSchema,
      },
      { name: JobApplicant.name, schema: JobApplicantSchema },
      { name: EmployeeFeedback.name, schema: EmployeeFeedbackSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [HrController],
  providers: [HrService],
  exports: [HrService],
})
export class HrModule {}
