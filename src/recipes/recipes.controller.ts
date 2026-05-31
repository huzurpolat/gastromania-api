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
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { CreateRecipeDto, UpdateRecipeDto } from './dto/recipe.dto';
import { RecipeService } from './recipe.service';

@Controller('recipes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
  Role.Admin,
  Role.Filialleiter,
  Role.Kueche,
  Role.Lager,
  Role.Einkauf,
  Role.Service,
)
export class RecipesController {
  constructor(private readonly recipeService: RecipeService) {}

  @Get()
  findAll(
    @Query('q') q?: string,
    @Query('category') category?: string,
    @Query('productionArea') productionArea?: string,
    @Query('active') active?: string,
  ) {
    return this.recipeService.findAll({ q, category, productionArea, active });
  }

  @Get('report')
  report() {
    return this.recipeService.report();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.recipeService.findOne(id);
  }

  @Post()
  @Roles(Role.Admin, Role.Filialleiter, Role.Kueche, Role.Lager, Role.Einkauf)
  create(
    @Body() payload: CreateRecipeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.recipeService.create(payload, user);
  }

  @Patch(':id')
  @Roles(Role.Admin, Role.Filialleiter, Role.Kueche, Role.Lager, Role.Einkauf)
  update(
    @Param('id') id: string,
    @Body() payload: UpdateRecipeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.recipeService.update(id, payload, user);
  }

  @Post(':id/copy')
  @Roles(Role.Admin, Role.Filialleiter, Role.Kueche, Role.Lager, Role.Einkauf)
  copy(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.recipeService.copy(id, user);
  }

  @Patch(':id/archive')
  @Roles(Role.Admin, Role.Filialleiter, Role.Kueche, Role.Lager, Role.Einkauf)
  archive(
    @Param('id') id: string,
    @Body('archived') archived: boolean,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.recipeService.archive(id, archived, user);
  }

  @Delete(':id')
  @Roles(Role.Admin, Role.Filialleiter)
  remove(@Param('id') id: string) {
    return this.recipeService.remove(id);
  }

  @Get(':id/costing')
  costing(@Param('id') id: string) {
    return this.recipeService.costing(id);
  }

  @Get(':id/nutrition')
  nutrition(@Param('id') id: string) {
    return this.recipeService.nutrition(id);
  }

  @Get(':id/allergens')
  allergens(@Param('id') id: string) {
    return this.recipeService.allergens(id);
  }

  @Post(':id/calculate')
  calculate(
    @Param('id') id: string,
    @Body('portions') portions?: number,
    @Body('locationId') locationId?: string,
  ) {
    return this.recipeService.calculate(id, portions, locationId);
  }
}
