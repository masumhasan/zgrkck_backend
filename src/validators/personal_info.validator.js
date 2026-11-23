const Joi = require('joi');

const personalInfoSchema = Joi.object({
  age: Joi.number().integer().min(13).max(120).required(),
  heightUnit: Joi.string().valid('cm', 'ft').default('cm'),
  height: Joi.when('heightUnit', {
    is: 'ft',
    then: Joi.number().min(1.5).max(9).required(),
    otherwise: Joi.number().min(50).max(300).required(),
  }),
  weight: Joi.number().min(10).max(500).required(),
  weightUnit: Joi.string().valid('kg', 'lbs').default('kg'),
  gender: Joi.string()
    .valid('Female', 'Male', 'Other', 'Prefer not to say')
    .required(),
});

module.exports = { personalInfoSchema };

