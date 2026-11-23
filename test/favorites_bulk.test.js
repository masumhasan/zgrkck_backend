const test = require('node:test');
const assert = require('node:assert');
const { recipeIdParamSchema } = require('../src/validators/favorite.validator');
const { bulkAddItemsSchema } = require('../src/validators/shopping.validator');

test('favourite recipe id must be a 24-char hex ObjectId', () => {
  assert.ifError(recipeIdParamSchema.validate({ recipeId: 'a'.repeat(24) }).error);
  assert.ok(recipeIdParamSchema.validate({ recipeId: 'not-an-id' }).error);
  assert.ok(recipeIdParamSchema.validate({ recipeId: 'g'.repeat(24) }).error);
});

test('bulk shopping add needs 1-100 named items and strips unknown fields', () => {
  const ok = bulkAddItemsSchema.validate(
    { items: [{ name: ' kidney beans ', userId: 'x' }] },
    { stripUnknown: true },
  );
  assert.ifError(ok.error);
  assert.deepStrictEqual(ok.value.items, [{ name: 'kidney beans' }]);
  assert.ok(bulkAddItemsSchema.validate({ items: [] }).error);
  assert.ok(bulkAddItemsSchema.validate({ items: [{ name: '' }] }).error);
  assert.ok(bulkAddItemsSchema.validate({}).error);
});
