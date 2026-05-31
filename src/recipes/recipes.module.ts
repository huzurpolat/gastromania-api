import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthJwtModule } from '../auth/auth-jwt.module';
import { StockItem, StockItemSchema } from '../stock/schemas/stock-item.schema';
import {
  StockMovement,
  StockMovementSchema,
} from '../stock/schemas/stock-movement.schema';
import { RecipeCalculationService } from './recipe-calculation.service';
import { RecipeInventoryService } from './recipe-inventory.service';
import { RecipeService } from './recipe.service';
import { RecipesController } from './recipes.controller';
import { Recipe, RecipeSchema } from './schemas/recipe.schema';

@Module({
  imports: [
    AuthJwtModule,
    MongooseModule.forFeature([
      { name: Recipe.name, schema: RecipeSchema },
      { name: StockItem.name, schema: StockItemSchema },
      { name: StockMovement.name, schema: StockMovementSchema },
    ]),
  ],
  controllers: [RecipesController],
  providers: [RecipeService, RecipeCalculationService, RecipeInventoryService],
  exports: [RecipeCalculationService, RecipeInventoryService],
})
export class RecipesModule {}
