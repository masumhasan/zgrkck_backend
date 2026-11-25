const { PUBLISHED_FILTER } = require('../models/recipe.model');

// The single place that decides what is SAFE for a user. Pure code, no AI.
// Dataset facts: allergens use snake_case keys (tree_nuts), diet lives in meta.dietaryFlags,
// ingredient categories include meat/poultry/fish/seafood/dairy/grains_pasta/baking_goods/sweeteners.

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const normaliseAllergen = (s) => String(s).toLowerCase().trim().replace(/[\s-]+/g, '_');

const ALCOHOL = /\b(wine|beer|rum|vodka|whisk(e)?y|brandy|liqueur|sherry|cider|gin|bourbon|champagne|sake|mirin|port)\b/i;
const PORK = /\b(pork|bacon|ham|prosciutto|pancetta|chorizo|lard|gelatin(e)?|salami)\b/i;
const JAIN_AVOID = /\b(onion|garlic|potato|carrot|beet(root)?|radish|turnip|ginger|leek|shallot|scallion)\b/i;

const NAME = 'ingredientGroups.ingredients.name';
const CATEGORY = 'ingredientGroups.ingredients.category';

const cleanList = (v) => (Array.isArray(v) ? v.map((s) => String(s).trim()).filter(Boolean) : []);

const profile = (onboarding = {}) => {
  const pref = String(onboarding.dietaryPreference || '').toLowerCase();
  const restr = cleanList(onboarding.dietaryRestrictions).map((r) => r.toLowerCase());
  const has = (k) => pref === k || restr.includes(k);
  const allergies = onboarding.hasNoRestrictions ? [] : cleanList(onboarding.allergies).map(normaliseAllergen);
  return {
    allergies,
    avoid: onboarding.hasNoRestrictions ? [] : cleanList(onboarding.specificIngredients),
    vegan: has('vegan'),
    vegetarian: has('vegetarian') || has('jain'),
    pescatarian: has('pescatarian'),
    keto: has('keto'),
    paleo: has('paleo'),
    halal: has('halal'),
    kosher: has('kosher'),
    jain: has('jain'),
    noAlcohol: has('no alcohol') || has('halal'),
  };
};

// Mongo filter used BEFORE anything is generated or ranked.
const buildSafeFilter = (onboarding = {}) => {
  const p = profile(onboarding);
  const filter = { ...PUBLISHED_FILTER };
  const and = [];
  const noNames = (rx) => and.push({ [NAME]: { $nin: [rx] } });
  const noCategories = (cats) => and.push({ [CATEGORY]: { $nin: cats } });

  if (p.allergies.length) {
    and.push({ 'allergens.contains': { $nin: p.allergies } });
    and.push({ 'allergens.mayContain': { $nin: p.allergies } });
    // Recipes with no allergen data at all are unverified: never serve them to an allergic user.
    and.push({
      $or: [
        { 'allergens.contains.0': { $exists: true } },
        { 'allergens.freeFrom.0': { $exists: true } },
        { 'allergens.mayContain.0': { $exists: true } },
      ],
    });
  }
  if (p.avoid.length) and.push({ [NAME]: { $nin: p.avoid.map((n) => new RegExp(escapeRegex(n), 'i')) } });

  if (p.vegan) and.push({ 'meta.dietaryFlags': 'vegan' });
  else if (p.vegetarian) and.push({ 'meta.dietaryFlags': { $in: ['vegetarian', 'vegan'] } });
  if (p.pescatarian) noCategories(['meat', 'poultry']);
  if (p.keto) noCategories(['grains_pasta', 'baking_goods', 'sweeteners']);
  if (p.paleo) noCategories(['grains_pasta', 'dairy', 'baking_goods', 'sweeteners']);
  if (p.halal || p.kosher) noNames(PORK);
  if (p.noAlcohol) noNames(ALCOHOL);
  if (p.kosher) {
    and.push({ 'allergens.contains': { $nin: ['shellfish'] } });
    and.push({ $nor: [{ [CATEGORY]: { $in: ['meat', 'poultry'] }, 'allergens.contains': 'dairy' }] });
  }
  if (p.jain) {
    noCategories(['meat', 'poultry', 'fish', 'seafood']);
    and.push({ 'allergens.contains': { $nin: ['eggs'] } });
    noNames(JAIN_AVOID);
  }

  if (onboarding.cookingTime) {
    const t = onboarding.cookingTime.toLowerCase();
    if (t.includes('15') && !t.includes('30')) filter['timing.totalMinutes'] = { $lte: 15 };
    else if (t.includes('30')) filter['timing.totalMinutes'] = { $lte: 30 };
    else if (t.includes('45')) filter['timing.totalMinutes'] = { $lte: 45 };
    else if (t.includes('60') && !t.includes('+')) filter['timing.totalMinutes'] = { $lte: 60 };
  }

  if (and.length) filter.$and = and;
  return filter;
};

// Code re-check of recipes AFTER retrieval/ranking/generation (the "validate" step of the AI pipeline).
// Needs `allergens` (and `meta.dietaryFlags` for diet checks) on the documents.
const isRecipeSafe = (recipe, onboarding = {}) => {
  const p = profile(onboarding);
  const a = recipe.allergens || {};
  if (p.allergies.length) {
    const bad = new Set([...(a.contains || []), ...(a.mayContain || [])].map(normaliseAllergen));
    if (p.allergies.some((x) => bad.has(x))) return false;
    // imported / typed-in recipes carry verified:false until the user confirms the ingredient list
    if (a.verified === false) return false;
    if (a.verified !== true && !(a.contains || []).length && !(a.freeFrom || []).length && !(a.mayContain || []).length) return false;
  }
  const flags = recipe.meta?.dietaryFlags;
  if (flags) {
    if (p.vegan && !flags.includes('vegan')) return false;
    if (p.vegetarian && !p.vegan && !flags.includes('vegetarian') && !flags.includes('vegan')) return false;
  }
  return true;
};

const filterSafe = (recipes, onboarding) => recipes.filter((r) => isRecipeSafe(r, onboarding));

// Which allergens an ingredient list (names) points to, as dataset keys. Deliberately broad: it only
// FLAGS for the user to confirm; it never clears a recipe (see verified in isRecipeSafe).
const ALLERGEN_WORDS = {
  dairy: /\b(milk|cheese|butter|cream|yogh?urt|whey|ghee|casein|custard|mascarpone|ricotta|paneer|parmesan|mozzarella|feta|halloumi|kefir)\b/i,
  eggs: /\b(eggs?|mayonnaise|mayo|meringue|aioli)\b/i,
  gluten: /\b(wheat|flour|bread(crumbs)?|pasta|spaghetti|noodles?|barley|rye|couscous|semolina|bulgur|farro|spelt|seitan|biscuits?|tortillas?|pastry|dough|soy sauce|lasagn?e|panko)\b/i,
  tree_nuts: /\b(almonds?|walnuts?|cashews?|pecans?|pistachios?|hazelnuts?|macadamias?|brazil nuts?|pine nuts?|marzipan|praline|nutella)\b/i,
  peanuts: /\b(peanuts?|groundnuts?)\b/i,
  soy: /\b(soy|soya|tofu|edamame|miso|tempeh|tamari)\b/i,
  fish: /\b(fish|salmon|tuna|cod|anchov(y|ies)|sardines?|haddock|mackerel|trout|halibut|bass|herring|pollock)\b/i,
  shellfish: /\b(shrimps?|prawns?|crab|lobster|mussels?|clams?|oysters?|scallops?|squid|calamari|crayfish|langoustines?)\b/i,
  sesame: /\b(sesame|tahini|hummus)\b/i,
  mustard: /\b(mustard)\b/i,
  celery: /\b(celery|celeriac)\b/i,
  sulfites: /\b(wine|dried (apricots?|fruit)|sulph?ites?)\b/i,
};
const detectAllergens = (names = []) => Object.keys(ALLERGEN_WORDS).filter((k) => names.some((n) => ALLERGEN_WORDS[k].test(String(n))));

module.exports = { buildSafeFilter, isRecipeSafe, filterSafe, escapeRegex, normaliseAllergen, detectAllergens };
