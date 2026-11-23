const Joi = require('joi');

const listQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(50).default(20),
  unreadOnly: Joi.boolean().default(false),
});

const idParamSchema = Joi.object({ id: Joi.string().hex().length(24).required() });

const prefsSchema = Joi.object({
  planReady: Joi.boolean(),
  shoppingReminder: Joi.boolean(),
  useItUp: Joi.boolean(),
  weeklyReport: Joi.boolean(),
}).min(1);

module.exports = { listQuerySchema, idParamSchema, prefsSchema };
