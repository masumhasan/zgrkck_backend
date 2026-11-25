const Joi = require('joi');

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(8).max(128).required(),
});
const deleteAccountSchema = Joi.object({ password: Joi.string().required() });

module.exports = { changePasswordSchema, deleteAccountSchema };
