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
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @Roles(Role.Admin, Role.Filialleiter, Role.Service)
  create(@Body() createOrderDto: CreateOrderDto) {
    return this.ordersService.create(createOrderDto);
  }

  @Get()
  @Roles(Role.Admin, Role.Filialleiter, Role.Service, Role.Kueche)
  findAll(
    @Query('locationId') locationId?: string,
    @Query('tableId') tableId?: string,
    @Query('status') status?: string,
  ) {
    return this.ordersService.findAll({ locationId, tableId, status });
  }

  @Get(':id')
  @Roles(Role.Admin, Role.Filialleiter, Role.Service, Role.Kueche)
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.Admin, Role.Filialleiter, Role.Service, Role.Kueche)
  update(@Param('id') id: string, @Body() updateOrderDto: UpdateOrderDto) {
    return this.ordersService.update(id, updateOrderDto);
  }

  @Delete(':id')
  @Roles(Role.Admin, Role.Filialleiter)
  remove(@Param('id') id: string) {
    return this.ordersService.remove(id);
  }
}
