import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import {
  CreateGuestVoucherDto,
  RedeemGuestVoucherDto,
  UpdateGuestVoucherDto,
} from './dto/voucher.dto';
import { LoyaltyService } from './loyalty.service';

const LOYALTY_ROLES = [
  Role.TenantAdminCode,
  Role.TenantAdmin,
  Role.RestaurantAdmin,
  Role.CompanyAdmin,
  Role.RegionAdmin,
  Role.Admin,
  Role.Regionalleiter,
  Role.Bereichsleiter,
  Role.Filialleiter,
  Role.Restaurantleiter,
  Role.Schichtleiter,
  Role.Service,
  Role.Theke,
  Role.Cashier,
  Role.Kasse,
  Role.Marketing,
];

@Controller('loyalty')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class LoyaltyController {
  constructor(private readonly loyaltyService: LoyaltyService) {}

  @Get('accounts')
  @Permissions('reservations.view')
  @Roles(...LOYALTY_ROLES)
  listAccounts(
    @CurrentUser() user: AuthenticatedUser,
    @Query('locationId') locationId?: string,
  ) {
    return this.loyaltyService.listAccounts(user, locationId);
  }

  @Get('accounts/:guestId')
  @Permissions('reservations.view')
  @Roles(...LOYALTY_ROLES)
  getAccount(
    @Param('guestId') guestId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.loyaltyService.getAccount(guestId, user);
  }
}

@Controller('vouchers')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class VouchersController {
  constructor(private readonly loyaltyService: LoyaltyService) {}

  @Get()
  @Permissions('reservations.view')
  @Roles(...LOYALTY_ROLES)
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('locationId') locationId?: string,
  ) {
    return this.loyaltyService.listVouchers(user, locationId);
  }

  @Post()
  @Permissions('reservations.create')
  @Roles(...LOYALTY_ROLES)
  create(
    @Body() payload: CreateGuestVoucherDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.loyaltyService.createVoucher(payload, user);
  }

  @Patch(':id')
  @Permissions('reservations.update')
  @Roles(...LOYALTY_ROLES)
  update(
    @Param('id') id: string,
    @Body() payload: UpdateGuestVoucherDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.loyaltyService.updateVoucher(id, payload, user);
  }

  @Patch(':id/redeem')
  @Permissions('reservations.update')
  @Roles(...LOYALTY_ROLES)
  redeem(
    @Param('id') id: string,
    @Body() payload: RedeemGuestVoucherDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.loyaltyService.redeemVoucher(id, payload, user);
  }

  @Delete(':id')
  @Permissions('reservations.delete')
  @Roles(...LOYALTY_ROLES)
  cancel(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.loyaltyService.cancelVoucher(id, user);
  }
}
