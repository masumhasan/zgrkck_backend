const Joi = require('joi');

const MEALS = ['Breakfast', 'Lunch', 'Snacks', 'Dinner'];
const DAYS = ['Off', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const appSettingsSchema = Joi.object({
  units: Joi.string().valid('metric', 'imperial'),
  mealSchedule: Joi.array().items(Joi.string().valid(...MEALS)).unique().min(1),
  planningDay: Joi.string().valid(...DAYS),
  cookingReminder: Joi.object({
    enabled: Joi.boolean(),
    time: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/),
  }).min(1),
}).min(1);

module.exports = { appSettingsSchema };
