const Joi = require('joi');

// whitelist: anything else (userId, urgency, _id...) is stripped by the validate middleware
const fields = {
  name: Joi.string().trim().min(1).max(100),
  storedIn: Joi.string().valid('Fridge', 'Freezer', 'Pantry'),
  qty: Joi.alternatives(Joi.string().trim().max(20), Joi.number()),
  unit: Joi.string().trim().allow('').max(20),
  useBy: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).allow(null, ''),
  imageUrl: Joi.string().uri({ scheme: ['http', 'https'] }),
  ingredientId: Joi.string().hex().length(24),
};

const addPantryItemSchema = Joi.object({ ...fields, name: fields.name.required() });
const updatePantryItemSchema = Joi.object(fields).min(1);

const parseListSchema = Joi.object({ text: Joi.string().trim().min(1).max(2000).required() });
// the reviewed list from "type a list", a receipt or a shopping trip
const bulkAddSchema = Joi.object({
  items: Joi.array().items(Joi.object({ ...fields, name: fields.name.required() })).min(1).max(60).required(),
});

module.exports = { addPantryItemSchema, updatePantryItemSchema, parseListSchema, bulkAddSchema };
