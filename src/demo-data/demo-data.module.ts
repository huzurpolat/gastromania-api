import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthJwtModule } from '../auth/auth-jwt.module';
import { Area, AreaSchema } from '../areas/schemas/area.schema';
import { City, CitySchema } from '../cities/schemas/city.schema';
import {
  Checklist,
  ChecklistSchema,
} from '../checklists/schemas/checklist.schema';
import { Company, CompanySchema } from '../companies/schemas/company.schema';
import {
  Department,
  DepartmentSchema,
} from '../departments/schemas/department.schema';
import {
  DutyShift,
  DutyShiftSchema,
} from '../duty-schedules/schemas/duty-shift.schema';
import {
  StaffAbsence,
  StaffAbsenceSchema,
} from '../staff-planning/schemas/staff-absence.schema';
import {
  StaffShift,
  StaffShiftSchema,
} from '../staff-planning/schemas/staff-shift.schema';
import {
  InternalMessage,
  InternalMessageSchema,
} from '../internal-messages/schemas/internal-message.schema';
import { Location, LocationSchema } from '../locations/schemas/location.schema';
import {
  MenuItem,
  MenuItemSchema,
} from '../menu-items/schemas/menu-item.schema';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import {
  Reservation,
  ReservationSchema,
} from '../reservations/schemas/reservation.schema';
import { Region, RegionSchema } from '../regions/schemas/region.schema';
import {
  RestaurantTable,
  RestaurantTableSchema,
} from '../tables/schemas/table.schema';
import { StockItem, StockItemSchema } from '../stock/schemas/stock-item.schema';
import {
  StockMovement,
  StockMovementSchema,
} from '../stock/schemas/stock-movement.schema';
import { Supplier, SupplierSchema } from '../suppliers/schemas/supplier.schema';
import {
  InventoryBatch,
  InventoryBatchSchema,
} from '../stock/schemas/inventory-batch.schema';
import {
  PurchaseOrder,
  PurchaseOrderSchema,
} from '../stock/schemas/purchase-order.schema';
import {
  TenantModule,
  TenantModuleSchema,
} from '../modules/schemas/tenant-module.schema';
import {
  PayrollPeriod,
  PayrollPeriodSchema,
} from '../payroll/schemas/payroll-period.schema';
import {
  TimeEntry,
  TimeEntrySchema,
} from '../time-tracking/schemas/time-entry.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import {
  UserLocationAssignment,
  UserLocationAssignmentSchema,
} from '../users/schemas/user-location-assignment.schema';
import { Tenant, TenantSchema } from '../tenants/schemas/tenant.schema';
import {
  WeeklyMenu,
  WeeklyMenuSchema,
} from '../weekly-menus/schemas/weekly-menu.schema';
import { DemoDataController } from './demo-data.controller';
import { DemoDataService } from './demo-data.service';

@Module({
  imports: [
    AuthJwtModule,
    MongooseModule.forFeature([
      { name: Location.name, schema: LocationSchema },
      { name: Company.name, schema: CompanySchema },
      { name: Department.name, schema: DepartmentSchema },
      { name: Region.name, schema: RegionSchema },
      { name: RestaurantTable.name, schema: RestaurantTableSchema },
      { name: MenuItem.name, schema: MenuItemSchema },
      { name: Order.name, schema: OrderSchema },
      { name: Reservation.name, schema: ReservationSchema },
      { name: User.name, schema: UserSchema },
      {
        name: UserLocationAssignment.name,
        schema: UserLocationAssignmentSchema,
      },
      { name: DutyShift.name, schema: DutyShiftSchema },
      { name: StaffShift.name, schema: StaffShiftSchema },
      { name: StaffAbsence.name, schema: StaffAbsenceSchema },
      { name: PayrollPeriod.name, schema: PayrollPeriodSchema },
      { name: TimeEntry.name, schema: TimeEntrySchema },
      { name: WeeklyMenu.name, schema: WeeklyMenuSchema },
      { name: InternalMessage.name, schema: InternalMessageSchema },
      { name: StockItem.name, schema: StockItemSchema },
      { name: StockMovement.name, schema: StockMovementSchema },
      { name: InventoryBatch.name, schema: InventoryBatchSchema },
      { name: PurchaseOrder.name, schema: PurchaseOrderSchema },
      { name: Supplier.name, schema: SupplierSchema },
      { name: Checklist.name, schema: ChecklistSchema },
      { name: Area.name, schema: AreaSchema },
      { name: City.name, schema: CitySchema },
      { name: Tenant.name, schema: TenantSchema },
      { name: TenantModule.name, schema: TenantModuleSchema },
    ]),
  ],
  controllers: [DemoDataController],
  providers: [DemoDataService],
})
export class DemoDataModule {}
