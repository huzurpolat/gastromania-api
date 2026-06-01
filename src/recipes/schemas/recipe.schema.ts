import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { ProductionArea } from '../../orders/schemas/order.schema';

export type RecipeDocument = HydratedDocument<Recipe>;

export enum RecipeType {
  Food = 'Speise',
  Drink = 'Getraenk',
  Dessert = 'Dessert',
  Menu = 'Menue',
  Buffet = 'Buffet',
  Cocktail = 'Cocktail',
  AddOn = 'Zusatzartikel',
  CateringPackage = 'Catering Paket',
}

@Schema({ _id: false })
export class RecipeNutrition {
  @Prop({ min: 0, default: 0 })
  calories!: number;

  @Prop({ min: 0, default: 0 })
  fat!: number;

  @Prop({ min: 0, default: 0 })
  saturatedFat!: number;

  @Prop({ min: 0, default: 0 })
  carbs!: number;

  @Prop({ min: 0, default: 0 })
  sugar!: number;

  @Prop({ min: 0, default: 0 })
  protein!: number;

  @Prop({ min: 0, default: 0 })
  salt!: number;
}

export const RecipeNutritionSchema =
  SchemaFactory.createForClass(RecipeNutrition);

@Schema({ _id: true })
export class RecipeIngredient {
  _id?: string;

  @Prop({ required: true, trim: true, index: true })
  stockItemId!: string;

  @Prop({ required: true, trim: true })
  stockItemName!: string;

  @Prop({ required: true, min: 0 })
  quantity!: number;

  @Prop({ required: true, trim: true })
  unit!: string;

  @Prop({ min: 0, default: 0 })
  purchasePriceNet!: number;

  @Prop({ type: [String], default: [] })
  allergens!: string[];

  @Prop({ type: [String], default: [] })
  additives!: string[];

  @Prop({ type: RecipeNutritionSchema, default: {} })
  nutrition!: RecipeNutrition;
}

export const RecipeIngredientSchema =
  SchemaFactory.createForClass(RecipeIngredient);

@Schema({ _id: true })
export class RecipeVariant {
  _id?: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, min: 0 })
  salePrice!: number;

  @Prop({ type: [RecipeIngredientSchema], default: [] })
  ingredients!: RecipeIngredient[];
}

export const RecipeVariantSchema = SchemaFactory.createForClass(RecipeVariant);

@Schema({ _id: true })
export class RecipeOption {
  _id?: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ min: 0, default: 0 })
  salePrice!: number;

  @Prop({ type: [RecipeIngredientSchema], default: [] })
  ingredients!: RecipeIngredient[];
}

export const RecipeOptionSchema = SchemaFactory.createForClass(RecipeOption);

@Schema({ _id: true })
export class RecipeComponent {
  _id?: string;

  @Prop({ required: true, trim: true })
  recipeId!: string;

  @Prop({ required: true, trim: true })
  recipeName!: string;

  @Prop({ required: true, min: 0, default: 1 })
  quantity!: number;
}

export const RecipeComponentSchema =
  SchemaFactory.createForClass(RecipeComponent);

@Schema({ _id: true })
export class RecipeStep {
  _id?: string;

  @Prop({ required: true, min: 1 })
  position!: number;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ required: true, trim: true })
  instruction!: string;

  @Prop({ trim: true })
  haccpNote?: string;

  @Prop({ trim: true })
  mediaUrl?: string;
}

export const RecipeStepSchema = SchemaFactory.createForClass(RecipeStep);

@Schema({ _id: true })
export class RecipeVersion {
  _id?: string;

  @Prop({ required: true })
  version!: number;

  @Prop({ required: true })
  changedAt!: Date;

  @Prop({ required: true, trim: true })
  changedBy!: string;

  @Prop({ type: Object, default: {} })
  snapshot!: Record<string, unknown>;
}

export const RecipeVersionSchema = SchemaFactory.createForClass(RecipeVersion);

@Schema({ timestamps: true, versionKey: false })
export class Recipe {
  @Prop({ trim: true, index: true })
  companyId?: string;

  @Prop({ trim: true, index: true })
  locationId?: string;

  @Prop({ required: true, unique: true, trim: true, index: true })
  recipeNumber!: string;

  @Prop({ trim: true, index: true })
  menuItemId?: string;

  @Prop({ required: true, trim: true, index: true })
  name!: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ required: true, trim: true, index: true })
  category!: string;

  @Prop({ trim: true })
  imageUrl?: string;

  @Prop({
    type: String,
    enum: Object.values(RecipeType),
    default: RecipeType.Food,
  })
  type!: RecipeType;

  @Prop({ required: true, min: 0 })
  salePrice!: number;

  @Prop({ min: 0, default: 19 })
  vatRate!: number;

  @Prop({ default: true, index: true })
  isActive!: boolean;

  @Prop({ default: true })
  visibleInSales!: boolean;

  @Prop({
    type: String,
    enum: Object.values(ProductionArea),
    default: ProductionArea.Kitchen,
  })
  productionArea!: ProductionArea;

  @Prop({ min: 0, default: 0 })
  preparationTimeMinutes!: number;

  @Prop({ trim: true, default: '1 Portion' })
  portionSize!: string;

  @Prop({ min: 1, default: 1 })
  basePortions!: number;

  @Prop({ default: false, index: true })
  isArchived!: boolean;

  @Prop({ type: [RecipeIngredientSchema], default: [] })
  ingredients!: RecipeIngredient[];

  @Prop({ type: [RecipeVariantSchema], default: [] })
  variants!: RecipeVariant[];

  @Prop({ type: [RecipeOptionSchema], default: [] })
  options!: RecipeOption[];

  @Prop({ type: [RecipeComponentSchema], default: [] })
  components!: RecipeComponent[];

  @Prop({ type: [String], default: [] })
  manualAllergens!: string[];

  @Prop({ type: [String], default: [] })
  manualAdditives!: string[];

  @Prop({ type: [RecipeStepSchema], default: [] })
  steps!: RecipeStep[];

  @Prop({ type: [RecipeVersionSchema], default: [] })
  versions!: RecipeVersion[];
}

export const RecipeSchema = SchemaFactory.createForClass(Recipe);

RecipeSchema.index({ name: 1, category: 1 });
RecipeSchema.index({ menuItemId: 1 });
RecipeSchema.index({ companyId: 1, locationId: 1 });
