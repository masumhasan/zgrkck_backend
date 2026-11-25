const Joi = require('joi');

// ingredient: a plain line ("2 cups flour") or { name, quantity, unit } from the app's editor / an import draft
const ingredient = Joi.alternatives().try(
  Joi.string().trim().min(1).max(200),
  Joi.object({
    name: Joi.string().trim().min(1).max(200).required(),
    quantity: Joi.number().min(0).max(100000).allow(null),
    unit: Joi.string().trim().max(20).allow(''),
  })
);

const macro = (max) => Joi.number().min(0).max(max);

const createRecipeSchema = Joi.object({
  title: Joi.string().trim().min(1).max(120).required(),
  summary: Joi.string().trim().allow('').max(500),
  cuisine: Joi.string().trim().allow('').max(60),
  mealType: Joi.string().trim().lowercase().valid('breakfast', 'lunch', 'dinner', 'snack').allow(''),
  servings: Joi.number().integer().min(1).max(100),
  prepMinutes: Joi.number().integer().min(0).max(1440),
  cookMinutes: Joi.number().integer().min(0).max(1440),
  imageUrl: Joi.string().uri({ scheme: ['http', 'https'] }).max(2000).allow(''),
  ingredients: Joi.array().items(ingredient).max(100),
  steps: Joi.array().items(Joi.string().trim().min(1).max(1000)).max(100),
  // where an import came from (kept with the recipe; imports stay private to the user)
  source: Joi.object({
    type: Joi.string().valid('link', 'text', 'photo').required(),
    url: Joi.string().uri({ scheme: ['http', 'https'] }).max(2000).allow(null, ''),
    name: Joi.string().trim().max(120).allow(null, ''),
  }),
  // the user checked the ingredient list for allergens; until then the recipe is unverified
  allergensVerified: Joi.boolean(),
  // per serving, only when the user typed their own numbers; otherwise the server estimates
  nutrition: Joi.object({ kcal: macro(5000), protein: macro(500), carbs: macro(1000), fat: macro(500) }),
});

const importLinkSchema = Joi.object({ url: Joi.string().trim().uri({ scheme: ['http', 'https'] }).max(2000).required() });
const importTextSchema = Joi.object({ text: Joi.string().trim().min(20).max(20000).required() });

const draftStepsSchema = Joi.object({
  title: Joi.string().trim().allow('').max(120),
  ingredients: Joi.array()
    .items(
      Joi.object({
        name: Joi.string().trim().min(1).max(200).required(),
        quantity: Joi.number().min(0).max(100000).allow(null),
        unit: Joi.string().trim().max(20).allow(''),
      })
    )
    .min(1)
    .max(100)
    .required(),
});

module.exports = { createRecipeSchema, importLinkSchema, importTextSchema, draftStepsSchema };
