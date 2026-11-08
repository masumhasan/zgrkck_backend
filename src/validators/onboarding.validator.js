const Joi = require('joi');

const onboardingSchema = Joi.object({
  goal: Joi.string().trim().allow(null, '').optional(),
  dietaryPreference: Joi.string().trim().optional(),
  nutritionFocuses: Joi.array().items(Joi.string().trim()).optional(),
  favouriteCuisines: Joi.array().items(Joi.string().trim()).optional(),
  hasNoRestrictions: Joi.boolean().optional(),
  allergies: Joi.array().items(Joi.string().trim()).optional(),
  dietaryRestrictions: Joi.array().items(Joi.string().trim()).optional(),
  specificIngredients: Joi.array().items(Joi.string().trim()).optional(),
  cookingTime: Joi.string().trim().optional(),
  cookingSkill: Joi.string().trim().optional(),
  householdType: Joi.string().trim().optional(),
  adultsCount: Joi.number().min(0).optional(),
  childrenCount: Joi.number().min(0).optional(),
  onboardingCompleted: Joi.boolean().optional(),
});

module.exports = { onboardingSchema };

