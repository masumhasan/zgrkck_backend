const Joi = require('joi');

const adminLoginSchema = Joi.object({
  email: Joi.string().email().trim().lowercase().required(),
  password: Joi.string().required(),
});

const profileSchema = Joi.object({
  name: Joi.string()
    .trim()
    .pattern(/\S+\s+\S+/)
    .max(100)
    .required()
    .messages({ 'string.pattern.base': 'Please enter both first and last name' }),
  email: Joi.string().email().trim().lowercase().required(),
});

const notificationsSchema = Joi.object({
  safetyAlerts: Joi.boolean(),
  recipeReviewAlerts: Joi.boolean(),
  systemAlerts: Joi.boolean(),
}).min(1);

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(8).max(128).required(),
});

const userStatusSchema = Joi.object({
  status: Joi.string().valid('active', 'inactive', 'suspended').required(),
});

const userPlanSchema = Joi.object({
  planId: Joi.string().hex().length(24).required(),
});

const planBase = {
  name: Joi.string().trim().max(60),
  cycle: Joi.string().valid('Monthly', 'Quarterly', 'Yearly'),
  price: Joi.number().min(0).precision(2),
  description: Joi.string().trim().allow('').max(300),
  status: Joi.string().valid('Active', 'Draft', 'Hidden'),
  iconType: Joi.string().valid('leaf', 'calendar', 'award'),
  aiLimit: Joi.number().integer().min(0),
  recipeLimit: Joi.string().trim().max(30),
  features: Joi.array().items(Joi.string().trim().max(80)).max(30),
};

const createPlanSchema = Joi.object({
  ...planBase,
  name: planBase.name.required(),
  price: planBase.price.required(),
});

const updatePlanSchema = Joi.object(planBase).min(1);

const recipeStatus = Joi.string().valid('Published', 'Needs Review', 'Draft');

const createRecipeSchema = Joi.object({
  title: Joi.string().trim().max(150).required(),
  cuisine: Joi.string().trim().max(80).required(),
  status: recipeStatus.default('Published'),
  imageUrl: Joi.string().trim().uri({ scheme: ['http', 'https'] }).allow('').optional(),
  summary: Joi.string().trim().allow('').max(1000),
  mealType: Joi.string().valid('breakfast', 'lunch', 'dinner', 'snack').default('dinner'),
  prepMinutes: Joi.number().integer().min(0).max(1440).default(0),
  cookMinutes: Joi.number().integer().min(0).max(1440).default(0),
  ingredients: Joi.array().items(Joi.string().trim().max(200)).max(80).default([]),
  steps: Joi.array().items(Joi.string().trim().max(1000)).max(60).default([]),
});

const recipeStatusSchema = Joi.object({ status: recipeStatus.required() });

module.exports = {
  adminLoginSchema,
  profileSchema,
  notificationsSchema,
  changePasswordSchema,
  userStatusSchema,
  userPlanSchema,
  createPlanSchema,
  updatePlanSchema,
  createRecipeSchema,
  recipeStatusSchema,
};
