const Joi = require('joi');

// :recipeId in /users/me/favorites/:recipeId must be a Mongo ObjectId
const recipeIdParamSchema = Joi.object({
  recipeId: Joi.string().hex().length(24).required(),
});

module.exports = { recipeIdParamSchema };
