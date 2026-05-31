import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthJwtModule } from '../auth/auth-jwt.module';
import { DepartmentsController } from './departments.controller';
import { DepartmentsService } from './departments.service';
import { Department, DepartmentSchema } from './schemas/department.schema';

@Module({
  imports: [
    AuthJwtModule,
    MongooseModule.forFeature([
      { name: Department.name, schema: DepartmentSchema },
    ]),
  ],
  controllers: [DepartmentsController],
  providers: [DepartmentsService],
})
export class DepartmentsModule {}
