const Joi = require('joi');

// Closed vocabularies: a misspelt allergy would silently stop filtering, so unknown values are rejected.
const ALLERGIES = ['Dairy', 'Peanuts', 'Tree Nuts', 'Gluten', 'Eggs', 'Shellfish', 'Fish', 'Soy', 'Sesame', 'Sulfites'];
const PREFERENCES = [
  'High-Protein', 'Gluten-Free', 'Vegetarian', 'Pescatarian',
  'Low-Carb', 'Mediterranean', 'Mild Spices Only', 'Dairy-Free',
];
const PORTIONS = [0.5, 1, 1.25, 1.5];

const fields = {
  name: Joi.string().trim().min(1).max(40),
  role: Joi.string().valid('adult', 'child'),
  portionFactor: Joi.number().valid(...PORTIONS),
  preferences: Joi.array().items(Joi.string().valid(...PREFERENCES)).unique().max(PREFERENCES.length),
  allergies: Joi.array().items(Joi.string().valid(...ALLERGIES)).unique().max(ALLERGIES.length),
  excludedIngredients: Joi.array().items(Joi.string().trim().min(1).max(40)).max(10),
};

const createMemberSchema = Joi.object({ ...fields, name: fields.name.required() });
const updateMemberSchema = Joi.object(fields).min(1);

const planModeSchema = Joi.object({ planForHousehold: Joi.boolean().required() });

module.exports = { planModeSchema, createMemberSchema, updateMemberSchema, ALLERGIES, PREFERENCES };
