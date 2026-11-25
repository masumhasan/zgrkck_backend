const Joi = require('joi');

const date = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required();
const mealType = Joi.string().uppercase().valid('BREAKFAST', 'LUNCH', 'DINNER', 'SNACK');
const objectId = Joi.string().hex().length(24);

const slotSchema = Joi.object({ date, mealType: mealType.required() });
const alternativesQuerySchema = slotSchema;
const replaceSchema = slotSchema.keys({ recipeId: objectId });
// recipeId = that recipe; customName = a named entry with no recipe (optional kcal);
// neither = let Mealist choose the best safe recipe for the slot. replace swaps out a meal already there.
const addMealSchema = slotSchema
  .keys({
    recipeId: objectId,
    customName: Joi.string().trim().min(1).max(80),
    kcal: Joi.number().integer().min(0).max(5000),
    servings: Joi.number().integer().min(1).max(12),
    replace: Joi.boolean().default(false),
  })
  .oxor('recipeId', 'customName')
  .with('kcal', 'customName');
const relocateSchema = slotSchema.keys({
  toDate: date,
  toMealType: mealType,
});
const servingsSchema = slotSchema.keys({ servings: Joi.number().integer().min(1).max(12).required() });
// a recipe, or a slot (date + mealType) alone for a custom entry that has no recipe; cooking straight from a recipe has no slot
const cookedSchema = Joi.object({
  recipeId: objectId,
  date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/),
  mealType,
  rating: Joi.number().integer().min(1).max(5),
})
  .and('date', 'mealType')
  .or('recipeId', 'date');
// "I ate this" from a recipe page: put the recipe in today's slot and mark it eaten in one step
const eatenSchema = slotSchema.keys({ recipeId: objectId.required() });

module.exports = { slotSchema, alternativesQuerySchema, replaceSchema, addMealSchema, relocateSchema, servingsSchema, cookedSchema, eatenSchema };
