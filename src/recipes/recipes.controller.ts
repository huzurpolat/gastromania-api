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
import { CreateRecipeDto, UpdateRecipeDto } from './dto/recipe.dto';
import { RecipeService } from './recipe.service';

@Controller('recipes')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
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
  @Permissions('recipes.view')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('q') q?: string,
    @Query('category') category?: string,
    @Query('productionArea') productionArea?: string,
    @Query('active') active?: string,
  ) {
    return this.recipeService.findAll(user, { q, category, productionArea, active });
  }

  @Get('report')
  @Permissions('recipes.report.export')
  report(@CurrentUser() user: AuthenticatedUser) {
    return this.recipeService.report(user);
  }

  @Get(':id')
  @Permissions('recipes.view')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.recipeService.findOne(id, user);
  }

  @Post()
  @Permissions('recipes.create')
  @Roles(Role.Admin, Role.Filialleiter, Role.Kueche, Role.Lager, Role.Einkauf)
  create(
    @Body() payload: CreateRecipeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.recipeService.create(payload, user);
  }

  @Patch(':id')
  @Permissions('recipes.update')
  @Roles(Role.Admin, Role.Filialleiter, Role.Kueche, Role.Lager, Role.Einkauf)
  update(
    @Param('id') id: string,
    @Body() payload: UpdateRecipeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.recipeService.update(id, payload, user);
  }

  @Post(':id/copy')
  @Permissions('recipes.create')
  @Roles(Role.Admin, Role.Filialleiter, Role.Kueche, Role.Lager, Role.Einkauf)
  copy(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.recipeService.copy(id, user);
  }

  @Patch(':id/archive')
  @Permissions('recipes.update')
  @Roles(Role.Admin, Role.Filialleiter, Role.Kueche, Role.Lager, Role.Einkauf)
  archive(
    @Param('id') id: string,
    @Body('archived') archived: boolean,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.recipeService.archive(id, archived, user);
  }

  @Delete(':id')
  @Permissions('recipes.delete')
  @Roles(Role.Admin, Role.Filialleiter)
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.recipeService.remove(id, user);
  }

  @Get(':id/costing')
  @Permissions('recipes.costing.view')
  costing(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.recipeService.costing(id, user);
  }

  @Get(':id/nutrition')
  @Permissions('recipes.view')
  nutrition(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.recipeService.nutrition(id, user);
  }

  @Get(':id/allergens')
  @Permissions('recipes.view')
  allergens(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.recipeService.allergens(id, user);
  }

  @Post(':id/calculate')
  @Permissions('recipes.costing.view')
  calculate(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body('portions') portions?: number,
    @Body('locationId') locationId?: string,
  ) {
    return this.recipeService.calculate(id, user, portions, locationId);
  }
}
