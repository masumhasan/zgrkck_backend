const Joi = require('joi');

// bulk add (e.g. "Add N missing to list" on Recipe Details); the service skips names already on the list
const bulkAddItemsSchema = Joi.object({
  items: Joi.array()
    .items(
      Joi.object({
        name: Joi.string().trim().min(1).max(100).required(),
        category: Joi.string().trim().max(60),
        qty: Joi.alternatives(Joi.string().trim().max(20), Joi.number()),
        unit: Joi.string().trim().allow('').max(20),
      }),
    )
    .min(1)
    .max(100)
    .required(),
});

module.exports = { bulkAddItemsSchema };
