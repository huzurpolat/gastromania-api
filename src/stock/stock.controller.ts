import {
  Body,
  Controller,
  Delete,
  Get,
  MessageEvent,
  Param,
  Patch,
  Post,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { CreateStockItemDto } from './dto/create-stock-item.dto';
import { UpdateStockItemDto } from './dto/update-stock-item.dto';
import { StockService } from './stock.service';

@Controller('stock')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin, Role.Filialleiter, Role.Lager)
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @Post()
  create(
    @Body() payload: CreateStockItemDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.stockService.create(payload, user);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('locationId') locationId?: string,
  ) {
    return this.stockService.findAll(user, locationId);
  }

  @Get('movements')
  findMovements(
    @CurrentUser() user: AuthenticatedUser,
    @Query('locationId') locationId?: string,
  ) {
    return this.stockService.findMovements(user, locationId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() payload: UpdateStockItemDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.stockService.update(id, payload, user);
  }

  @Post(':id/adjust')
  adjust(
    @Param('id') id: string,
    @Body() payload: AdjustStockDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.stockService.adjust(id, payload, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.stockService.remove(id, user);
  }

  @Sse('stream')
  stream(@CurrentUser() user: AuthenticatedUser): Observable<MessageEvent> {
    return this.stockService.stream(user);
  }
}
