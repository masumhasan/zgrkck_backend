const Joi = require('joi');

const createRecipeSchema = Joi.object({
  title: Joi.string().trim().min(1).max(120).required(),
  summary: Joi.string().trim().allow('').max(500),
  cuisine: Joi.string().trim().max(60),
  mealType: Joi.string().trim().lowercase().valid('breakfast', 'lunch', 'dinner', 'snack'),
  prepMinutes: Joi.number().integer().min(0).max(1440),
  cookMinutes: Joi.number().integer().min(0).max(1440),
  imageUrl: Joi.string().uri({ scheme: ['http', 'https'] }),
  ingredients: Joi.array().items(Joi.string().trim().min(1).max(200)).max(100),
  steps: Joi.array().items(Joi.string().trim().min(1).max(1000)).max(100),
});

module.exports = { createRecipeSchema };
