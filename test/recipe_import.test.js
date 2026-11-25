const test = require('node:test');
const assert = require('node:assert/strict');
const { parseIngredientLine, lineFor, parseDuration, extractJsonLdRecipe, parseRecipeText } = require('../src/utils/recipe_parse.util');
const { fetchPage, isPrivateAddress } = require('../src/utils/safe_fetch.util');
const { buildDraft } = require('../src/services/recipe_import.service');
const { isRecipeSafe, detectAllergens } = require('../src/services/safety_filter.service');
const { createRecipeSchema, importTextSchema, importLinkSchema } = require('../src/validators/user_recipe.validator');

test('ingredient lines: quantity, unit, name, uncertainty', () => {
  assert.deepEqual(parseIngredientLine('1 1/2 cups plain flour, sifted'), { name: 'plain flour', quantity: 1.5, unit: 'cup', displayText: '1 1/2 cups plain flour, sifted', uncertain: false });
  assert.equal(parseIngredientLine('400g tinned tomatoes').unit, 'g');
  assert.equal(parseIngredientLine('400g tinned tomatoes').quantity, 400);
  assert.equal(parseIngredientLine('½ tsp salt').quantity, 0.5);
  assert.equal(parseIngredientLine('2 tbsp. olive oil').unit, 'tbsp');
  const eggs = parseIngredientLine('2 eggs');
  assert.deepEqual([eggs.quantity, eggs.unit, eggs.name], [2, '', 'eggs']);
  assert.equal(parseIngredientLine('1 can chopped tomatoes').unit, 'unit'); // no "can" in the dropdown
  assert.equal(parseIngredientLine('salt to taste').uncertain, false); // no amount needed
  assert.equal(parseIngredientLine('chopped parsley').uncertain, true); // no amount, not optional
});

test('ingredient lines: dual units and pack sizes (as printed by BBC and UK supermarkets)', () => {
  const flour = parseIngredientLine('225 g/8oz plain flour');
  assert.deepEqual([flour.quantity, flour.unit, flour.name], [225, 'g', 'plain flour']);
  const milk = parseIngredientLine('1 cup/240ml whole milk');
  assert.deepEqual([milk.quantity, milk.unit, milk.name], [1, 'cup', 'whole milk']);
  const tin = parseIngredientLine('2 x 400g tin chopped tomatoes');
  assert.deepEqual([tin.quantity, tin.unit, tin.name], [800, 'g', 'chopped tomatoes']);
  const floz = parseIngredientLine('250ml/9fl oz milk');
  assert.deepEqual([floz.quantity, floz.unit, floz.name], [250, 'ml', 'milk']);
  assert.equal(parseIngredientLine('125ml/4½fl oz vegetable oil').name, 'vegetable oil');
  const half = parseIngredientLine('350g/12½oz caster sugar');
  assert.deepEqual([half.quantity, half.unit, half.name], [350, 'g', 'caster sugar']);
});

test('pasted text: only labelled lines set times, titles come from line 1 only, one-paragraph and prose', () => {
  const t = parseRecipeText('Chicken Curry\nServes 4\nIngredients:\n- 500g chicken thigh\nDirections:\n1. Fry the onion, then cook 5 minutes more until soft and golden.');
  assert.equal(t.cookMinutes, 0); // "cook 5 minutes" is inside a step, not a cook time
  assert.equal(parseRecipeText('Cook time: 25 min\nPrep: 10 mins\nPancakes\n2 eggs').cookMinutes, 25);

  const noTitle = parseRecipeText('2 eggs\n1 cup flour\n1 cup milk\nWhisk everything together and fry small circles in a buttered pan until golden.');
  assert.equal(noTitle.title, ''); // a step is never promoted to a title
  assert.deepEqual(noTitle.ingredients, ['2 eggs', '1 cup flour', '1 cup milk']);
  assert.equal(noTitle.steps.length, 1);

  const para = parseRecipeText('Lemon Pasta. 200 g spaghetti, 2 tbsp olive oil, juice of 1 lemon. Boil the pasta, toss with the oil and lemon.');
  assert.equal(para.title, 'Lemon Pasta');
  assert.equal(para.ingredients.length, 3);
  assert.equal(para.steps.length, 1);

  const prose = parseRecipeText('You should really just boil some potatoes and eat them with butter and salt, it is lovely.');
  assert.deepEqual([prose.ingredients.length, prose.steps.length], [0, 0]);
  assert.throws(() => buildDraft(prose, { type: 'text' }), (e) => e.statusCode === 422); // no ingredients or steps = no recipe
});

test('stored lines carry metric so nutrition can weigh them', () => {
  const tbsp = lineFor({ name: 'olive oil', quantity: 3, unit: 'tbsp' });
  assert.equal(tbsp.unit, 'tablespoon');
  assert.equal(tbsp.metricUnit, 'milliliter');
  assert.ok(Math.abs(tbsp.metricQuantity - 44.36) < 0.01);
  assert.equal(lineFor({ name: 'flour', quantity: 2, unit: 'lb' }).metricQuantity, 907.2);
  assert.equal(lineFor({ name: 'eggs', quantity: 3, unit: 'unit' }).unit, 'piece');
  assert.equal(lineFor({ name: 'salt' }).metricUnit, undefined);
});

test('durations', () => {
  assert.equal(parseDuration('PT1H30M'), 90);
  assert.equal(parseDuration('PT45M'), 45);
  assert.equal(parseDuration('nonsense'), 0);
});

test('JSON-LD: finds the Recipe in @graph, reads yield array, HowToSection steps, entities', () => {
  const html = `<html><head><meta property="og:image" content="https://x.test/og.jpg">
  <script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', name: 'Site' },
      {
        '@type': ['Recipe'],
        name: 'Tom &amp; Jerry Pie',
        description: '<p>Tasty</p>',
        recipeYield: ['6', '6 servings'],
        prepTime: 'PT15M',
        cookTime: 'PT1H',
        recipeCuisine: 'British',
        recipeCategory: 'Dinner',
        recipeIngredient: ['2 eggs', '1 cup milk'],
        recipeInstructions: [{ '@type': 'HowToSection', itemListElement: [{ '@type': 'HowToStep', text: '1. Mix.' }, { '@type': 'HowToStep', text: 'Bake.' }] }],
        author: { name: 'Ann' },
      },
    ],
  })}</script></head></html>`;
  const raw = extractJsonLdRecipe(html);
  assert.equal(raw.title, 'Tom & Jerry Pie');
  assert.equal(raw.servings, 6);
  assert.equal(raw.cookMinutes, 60);
  assert.deepEqual(raw.steps, ['Mix.', 'Bake.']);
  assert.equal(raw.imageUrl, 'https://x.test/og.jpg');
  assert.equal(raw.sourceName, 'Ann');
  assert.equal(extractJsonLdRecipe('<html><script type="application/ld+json">{"@type":"Article"}</script></html>'), null);
  assert.equal(extractJsonLdRecipe('<html><script type="application/ld+json">{broken</script></html>'), null);
});

test('pasted text: with headings and without', () => {
  const withHeads = parseRecipeText('Pancakes\nFluffy and quick.\nServes 4\nPrep: 10 min\nIngredients\n- 2 cups flour\n- 2 eggs\nMethod\n1. Mix everything together.\n2. Fry in a hot pan until golden.');
  assert.equal(withHeads.title, 'Pancakes');
  assert.equal(withHeads.servings, 4);
  assert.equal(withHeads.prepMinutes, 10);
  assert.deepEqual(withHeads.ingredients, ['2 cups flour', '2 eggs']);
  assert.deepEqual(withHeads.steps, ['Mix everything together.', 'Fry in a hot pan until golden.']);
  assert.equal(withHeads.summary, 'Fluffy and quick.');

  const bare = parseRecipeText('Quick Salad\n2 tomatoes\n1 cucumber\nChop the vegetables and toss them with oil and salt.');
  assert.deepEqual(bare.ingredients, ['2 tomatoes', '1 cucumber']);
  assert.equal(bare.steps.length, 1);
});

test('draft: clipped to what saving accepts, servings default is flagged, empty input is refused', () => {
  const d = buildDraft({ title: 'T'.repeat(300), ingredients: ['2 eggs', '1 cup milk'], steps: ['Mix'], mealType: 'Breakfast & brunch', imageUrl: 'javascript:alert(1)' }, { type: 'text', url: null, name: null });
  assert.equal(d.title.length, 120);
  assert.equal(d.servings, 4);
  assert.deepEqual(d.uncertain, ['servings']);
  assert.equal(d.mealType, 'breakfast');
  assert.equal(d.imageUrl, '');
  assert.equal(d.ingredients[1].unit, 'cup');
  assert.throws(() => buildDraft({ title: '', ingredients: [], steps: [] }, { type: 'photo' }), (e) => e.statusCode === 422 && /photo/.test(e.message));
});

test('SSRF guard: private, loopback and metadata addresses are refused before any request', async () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.9', '172.20.0.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1']) assert.equal(isPrivateAddress(ip), true, ip);
  for (const ip of ['8.8.8.8', '93.184.216.34', '2606:4700::1111']) assert.equal(isPrivateAddress(ip), false, ip);
  await assert.rejects(fetchPage('http://169.254.169.254/latest/meta-data/'), (e) => e.statusCode === 400);
  await assert.rejects(fetchPage('http://localhost/'), (e) => e.statusCode === 400);
  await assert.rejects(fetchPage('file:///etc/passwd'), (e) => e.statusCode === 400);
  await assert.rejects(fetchPage('http://example.com:8080/'), (e) => e.statusCode === 400);
});

test('allergens: detection flags, unverified recipes are never safe for allergic users', () => {
  assert.deepEqual(detectAllergens(['plain flour', 'tahini', 'prawns', 'butter']).sort(), ['dairy', 'gluten', 'sesame', 'shellfish']);
  assert.deepEqual(detectAllergens(['basil', 'tomato']), []);
  const allergic = { allergies: ['Peanuts'] };
  const none = { hasNoRestrictions: true };
  assert.equal(isRecipeSafe({ allergens: { contains: [], verified: false } }, allergic), false); // user has not confirmed the list
  assert.equal(isRecipeSafe({ allergens: { contains: [], verified: true } }, allergic), true); // confirmed, nothing flagged
  assert.equal(isRecipeSafe({ allergens: { contains: ['peanuts'], verified: true } }, allergic), false);
  assert.equal(isRecipeSafe({ allergens: { contains: [], verified: false } }, none), true); // no allergy: not blocked
  assert.equal(isRecipeSafe({ allergens: {} }, allergic), false); // catalogue rule unchanged: no data = unsafe
});

test('validators: structured ingredients, empty optional strings, bad source, short text', () => {
  const ok = createRecipeSchema.validate({
    title: 'Pie',
    cuisine: '',
    imageUrl: '',
    servings: 6,
    ingredients: ['2 eggs', { name: 'milk', quantity: 1, unit: 'cup' }, { name: 'salt', quantity: null, unit: '' }],
    steps: ['Mix'],
    source: { type: 'link', url: 'https://x.test/r', name: 'x.test' },
    allergensVerified: false,
    nutrition: { kcal: 400 },
  });
  assert.equal(ok.error, undefined);
  assert.ok(createRecipeSchema.validate({ title: 'Pie', source: { type: 'fax' } }).error);
  assert.ok(createRecipeSchema.validate({ title: 'Pie', servings: 0 }).error);
  assert.ok(importTextSchema.validate({ text: 'too short' }).error);
  assert.ok(importLinkSchema.validate({ url: 'ftp://x.test' }).error);
  assert.equal(importLinkSchema.validate({ url: 'https://x.test/recipe' }).error, undefined);
});
