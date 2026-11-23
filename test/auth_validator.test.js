const test = require('node:test');
const assert = require('node:assert');
const { registerSchema } = require('../src/validators/auth.validator');

const base = {
  firstName: 'Ana',
  lastName: 'Lee',
  email: 'ana@example.com',
  password: 'password1',
  confirmPassword: 'password1',
};
const opts = { abortEarly: false, stripUnknown: true };

test('register requires accepting the terms', () => {
  assert.ok(registerSchema.validate(base, opts).error);
  assert.ok(registerSchema.validate({ ...base, acceptTerms: false }, opts).error);
});

test('register passes with terms accepted; marketing defaults to false', () => {
  const { error, value } = registerSchema.validate({ ...base, acceptTerms: true }, opts);
  assert.strictEqual(error, undefined);
  assert.strictEqual(value.marketingOptIn, false);
});

test('marketing opt-in is kept separate from terms', () => {
  const { value } = registerSchema.validate({ ...base, acceptTerms: true, marketingOptIn: true }, opts);
  assert.strictEqual(value.marketingOptIn, true);
});
