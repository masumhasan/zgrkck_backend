const Joi = require('joi');

const personalInfoSchema = Joi.object({
  age: Joi.number().min(1).max(120).required(),
  height: Joi.number().min(30).max(300).required(),
  heightUnit: Joi.string().valid('cm', 'ft').default('cm'),
  weight: Joi.number().min(10).max(500).required(),
  weightUnit: Joi.string().valid('kg', 'lbs').default('kg'),
  gender: Joi.string()
    .valid('Female', 'Male', 'Other', 'Prefer not to say')
    .required(),
});

module.exports = { personalInfoSchema };

