const { Recipe } = require('../models/recipe.model');
const { PantryItem } = require('../models/pantry.model');
const { buildSafeFilter, filterSafe, escapeRegex } = require('./safety_filter.service');
const { loadPeople, unionProfile } = require('./household.service');
const { makeCovers } = require('../utils/ingredient_match.util');

// Pipeline (AI layer contract): retrieve -> hard filter (safety filter on the union of everyone eating)
// -> score & rank (pantry coverage) -> compose (plain code, no LLM needed) -> validate (filterSafe again).
const MAX_MISSING = 2;
const MAX_RESULTS = 30;
const MAX_GUESTS = 10;

// Assumed to be in every kitchen, so never "missing".
const STAPLE = /^(sea )?salt$|^water$|^ice$|^(black |white )?pepper$|^(olive |vegetable |sunflower |cooking )?oil$/i;

const httpError = (message, statusCode) => Object.assign(new Error(message), { statusCode });
const round2 = (n) => Math.round(n * 100) / 100;
const joinNames = (names) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]);
const firstName = (p) => (p.isOwner ? p.name.split(' ')[0] : p.name);

// "Jane Doe" -> JD, "Alex" -> AL
const initials = (name) => {
  const w = name.trim().split(/\s+/);
  return (w.length > 1 ? w[0][0] + w[1][0] : name.trim().slice(0, 2)).toUpperCase();
};

const stockOf = (recipe, covers) => {
  const needed = (recipe.ingredientGroups || [])
    .flatMap((g) => g.ingredients)
    .filter((i) => !i.isOptional && !STAPLE.test(i.name.trim()));
  const missing = [...new Set(needed.filter((i) => !covers(i.name)).map((i) => i.name.trim().toLowerCase()))];
  return { total: needed.length, missing };
};

const stockBadge = (missing) => {
  if (!missing.length) return '100% IN STOCK';
  return `MISSING ${missing.length} ITEM${missing.length > 1 ? 'S' : ''}${missing.length === 1 ? ` (${missing[0].toUpperCase()})` : ''}`;
};

const personTag = (p) => {
  const tags = [...p.allergies.map((a) => `No ${a}`), ...p.preferences];
  return tags.length ? `${tags[0]}${tags.length > 1 ? ` +${tags.length - 1}` : ''}` : 'No restrictions';
};

const reasonFor = ({ stock, eating, profile }) => {
  const have = stock.missing.length
    ? `You have ${stock.total - stock.missing.length} of ${stock.total} ingredients; missing ${stock.missing.join(', ')}.`
    : 'Everything you need is in your pantry.';
  const who = eating.length === 1 ? 'you' : joinNames(eating.map(firstName));
  const free = profile.allergies.length ? `, free of ${joinNames(profile.allergies)}` : '';
  return `${have} Safe for ${who}${free}.`;
};

const whatCanICook = async (userId, { memberIds = [], guests = 0 } = {}) => {
  const { user, people } = await loadPeople(userId);
  const eating = memberIds.length ? people.filter((p) => memberIds.includes(p.id)) : people;
  if (!eating.length) throw httpError('Select at least one person to cook for.', 400);

  const profile = unionProfile(eating, user.onboarding?.cookingTime);
  const guestCount = Math.min(MAX_GUESTS, Math.max(0, Math.floor(guests) || 0));
  const factor = round2(eating.reduce((sum, p) => sum + p.portionFactor, 0) + guestCount);
  const servings = Math.max(1, Math.round(factor));

  const pantry = await PantryItem.find({ userId }).select('name').lean().exec();
  const covers = makeCovers(pantry.map((i) => i.name));
  const words = [...new Set(pantry.flatMap((i) => i.name.toLowerCase().split(/[^a-z]+/)).filter((w) => w.length >= 3))];

  let recipes = [];
  if (words.length) {
    // pre-filter only; stockOf below is the authority on what is covered
    const filter = { ...buildSafeFilter(profile), 'ingredientGroups.ingredients.name': { $in: words.map((w) => new RegExp(`\\b${escapeRegex(w)}`, 'i')) } };
    const found = await Recipe.find(filter).select('title media timing allergens meta ingredientGroups').lean().exec();
    recipes = filterSafe(found, profile)
      .map((r) => ({ recipe: r, stock: stockOf(r, covers) }))
      .filter(({ stock }) => stock.missing.length <= MAX_MISSING)
      .sort((a, b) => a.stock.missing.length - b.stock.missing.length
        || (a.recipe.timing?.totalMinutes || 999) - (b.recipe.timing?.totalMinutes || 999))
      .slice(0, MAX_RESULTS);
  }

  const favourites = new Set((user.favoriteRecipes || []).map(String));
  const ids = new Set(eating.map((p) => p.id));
  return {
    members: people.map((p) => ({
      id: p.id,
      name: firstName(p) + (p.role === 'child' ? ' (Kid)' : ''),
      initials: initials(p.name),
      role: p.role,
      isOwner: p.isOwner,
      portionFactor: p.portionFactor,
      tag: personTag(p),
      selected: ids.has(p.id),
    })),
    batch: { factor, guests: guestCount, servings },
    shield: {
      allergens: profile.allergies,
      excluded: profile.specificIngredients,
      mildFor: eating.filter((p) => p.role === 'child' || p.preferences.includes('Mild Spices Only')).map(firstName),
    },
    pantryCount: pantry.length,
    recipes: recipes.map(({ recipe, stock }) => ({
      id: String(recipe._id),
      title: recipe.title,
      imageUrl: recipe.media?.imageUrl || null,
      totalMinutes: recipe.timing?.totalMinutes || 0,
      servings,
      inStock: !stock.missing.length,
      missing: stock.missing,
      stockBadge: stockBadge(stock.missing),
      safeBadge: eating.length > 1 ? `SAFE FOR ALL ${eating.length}` : 'SAFE FOR YOU',
      reason: reasonFor({ stock, eating, profile }),
      isFavorite: favourites.has(String(recipe._id)),
    })),
  };
};

module.exports = { whatCanICook, makeCovers, stockOf, initials, MAX_GUESTS };
