import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Company, CompanySchema } from '../companies/schemas/company.schema';
import {
  Department,
  DepartmentSchema,
} from '../departments/schemas/department.schema';
import { Location, LocationSchema } from '../locations/schemas/location.schema';
import { Region, RegionSchema } from '../regions/schemas/region.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { AccessPolicyService } from './access-policy.service';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Company.name, schema: CompanySchema },
      { name: Department.name, schema: DepartmentSchema },
      { name: Region.name, schema: RegionSchema },
      { name: Location.name, schema: LocationSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  providers: [AccessPolicyService],
  exports: [AccessPolicyService],
})
export class AccessModule {}
