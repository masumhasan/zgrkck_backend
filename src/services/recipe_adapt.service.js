const mongoose = require('mongoose');
const SUBSTITUTIONS = require('../../dataset/substitutions.json');
const { Recipe, PUBLISHED_FILTER } = require('../models/recipe.model');
const { User } = require('../models/user.model');
const { estimateFromLines } = require('./import_nutrition.service');
const { normaliseAllergen } = require('./safety_filter.service');
const { planProfile } = require('./household.service');
const safetyEscalation = require('./safety_escalation.service');

// Ask Mealist (AI layer contract): the request is read by code, swaps come ONLY from the curated table
// (dataset/substitutions.json), and the result is re-checked in code: did it reach the goal, does any swap add an
// allergen this user / household has, what do the nutrition numbers say now. No model decides any of that.
// shortcut: no LLM rewording of the steps (the spec allows it, nothing needs it); the steps are copied as they are.
const httpError = (message, statusCode) => Object.assign(new Error(message), { statusCode });

const SUPPORTED =
  'I can make a recipe dairy-free, gluten-free, vegan, vegetarian, healthier or higher in protein, or scale it ' +
  '(for example "for 6 people", "double it"). Try one of those.';

const INTENTS = [
  ['dairy_free', /dairy[- ]?free|no dairy|lactose|without (milk|dairy|cheese|butter)/i],
  ['gluten_free', /gluten[- ]?free|no gluten|coeliac|celiac/i],
  ['vegan', /\bvegan\b|plant[- ]based/i],
  ['vegetarian', /vegetarian|meat[- ]?free|no meat/i],
  ['healthier', /healthier|lighter|\blow(er)?[- ]?(calorie|fat|cal)\b|less (fat|sugar)|\bunder \d+\s*kcal|slim/i],
  ['protein', /protein/i],
];

const DAIRY = /\b(milk|cheese|butter|cream|yogh?urt|whey|ghee|casein|custard|mascarpone|ricotta|paneer|parmesan|mozzarella|feta|halloumi|kefir)\b/i;
const PLANT = /\b(oat|almond|soy|coconut|rice|cashew|plant|vegan|dairy[- ]?free|flax)\b/i;
const NOT_DAIRY = /\b(peanut|cocoa|cacao|nut|apple|shea) butter\b|\bcream of tartar\b/i;
const GLUTEN = /\b(wheat|flour|bread(crumbs)?|pasta|spaghetti|noodles?|barley|rye|couscous|semolina|bulgur|bulghur|farro|spelt|seitan|biscuits?|tortillas?|pastry|dough|soy sauce|lasagn?e|panko|penne|fusilli|macaroni|orzo|pitta|naan|buns?)\b/i;
const NOT_GLUTEN = /\b(gluten[- ]?free|rice|corn|chickpea|lentil|almond|coconut|buckwheat|tamari|quinoa)\b/i;
const EGG = /\beggs?\b(?!\s*plants?)/i;
const MEAT = /\b(chicken|beef|pork|bacon|ham|lamb|turkey|duck|sausages?|mince|steak|prosciutto|chorizo|salami|veal|fish|salmon|tuna|cod|anchov\w*|prawns?|shrimps?|crab|lobster|mussels?|squid|gelatin)\b/i;

const hasDairy = (n) => DAIRY.test(n) && !PLANT.test(n) && !NOT_DAIRY.test(n);
const hasGluten = (n) => GLUTEN.test(n) && !NOT_GLUTEN.test(n);
const hasEgg = (n) => EGG.test(n) && !/flax/i.test(n);
const VIOLATES = {
  dairy_free: hasDairy,
  gluten_free: hasGluten,
  vegan: (n) => hasDairy(n) || hasEgg(n) || MEAT.test(n) || /\bhoney\b/i.test(n),
  vegetarian: (n) => MEAT.test(n) && !/\bstock|broth\b/i.test(n),
};
// allergen keys we can prove gone: only when nothing left in the recipe still carries them
const CARRIES = { dairy: hasDairy, gluten: hasGluten, eggs: hasEgg, fish: (n) => /\b(fish|salmon|tuna|cod|anchov\w*)\b/i.test(n) };

const round = (n) => Math.round(n * 100) / 100;
const termRx = (t) => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(e?s)?\\b`, 'i');

const readIntent = (prompt) => {
  const text = String(prompt || '');
  const tags = INTENTS.filter(([, rx]) => rx.test(text)).map(([k]) => k);
  let servings = null; // { to } | { factor }
  const n = text.match(/\bfor (\d{1,2})\b|\b(\d{1,2}) (?:people|persons|servings|guests)\b/i);
  if (n) servings = { to: Number(n[1] || n[2]) };
  else if (/\bdouble\b/i.test(text)) servings = { factor: 2 };
  else if (/\bhalf|halve\b/i.test(text)) servings = { factor: 0.5 };
  return { tags, servings };
};

// first table entry for this ingredient that serves one of the wanted tags and does not add an allergen to avoid
const pickSubstitution = (name, tags, avoid) =>
  SUBSTITUTIONS.find(
    (s) =>
      s.tags.some((t) => tags.includes(t)) &&
      s.match.some((m) => termRx(m).test(name)) &&
      !s.unless.some((u) => name.toLowerCase().includes(u)) &&
      !s.adds.some((a) => avoid.has(a)),
  );

const shown = (qty, unit, name) => [qty == null ? '' : round(qty), unit && unit !== 'piece' && unit !== 'as_needed' && unit !== 'to_taste' ? unit : '', name].filter((x) => x !== '').join(' ');

// builds the adapted version. Pure given the recipe, prompt and allergens to avoid (tested without a database).
const adaptRecipe = (recipe, prompt, avoidAllergens = new Set()) => {
  const { tags, servings } = readIntent(prompt);
  if (!tags.length && !servings) throw httpError(SUPPORTED, 422);

  const before = recipe.yield?.servings || 4;
  const after = servings?.to || Math.max(1, Math.round(before * (servings?.factor || 1)));
  const scale = after / before;
  const changes = [];
  const notes = [];

  const lines = [];
  for (const g of recipe.ingredientGroups || []) {
    for (const ing of g.ingredients || []) {
      const sub = tags.length ? pickSubstitution(ing.name, tags, avoidAllergens) : null;
      const ratio = (sub?.ratio || 1) * scale;
      const line = { name: sub ? sub.to : ing.name, unit: ing.unit, category: ing.category, isOptional: ing.isOptional };
      if (ing.quantity != null) line.quantity = round(ing.quantity * ratio);
      if (ing.metricQuantity != null) { line.metricQuantity = round(ing.metricQuantity * ratio); line.metricUnit = ing.metricUnit; }
      line.displayText = shown(line.quantity, line.unit, line.name);
      lines.push({ ...line, _sub: sub, _group: g.groupName });
      if (sub) changes.push({ from: ing.name, to: sub.to, before: ing.displayText || shown(ing.quantity, ing.unit, ing.name), after: line.displayText, reason: sub.note });
      else if (tags.length) {
        const blocked = SUBSTITUTIONS.find((s) => s.tags.some((t) => tags.includes(t)) && s.match.some((m) => termRx(m).test(ing.name)) && !s.unless.some((u) => ing.name.toLowerCase().includes(u)));
        if (blocked && blocked.adds.some((a) => avoidAllergens.has(a))) notes.push(`Skipped ${blocked.to} for ${ing.name}: it would add something you avoid.`);
      }
    }
  }

  // did it reach what was asked?
  const remaining = [...new Set(lines.filter((l) => tags.some((t) => VIOLATES[t]?.(l.name))).map((l) => l.name))];

  // allergens: keep the original list, drop only what provably left, add what the swaps bring
  let contains = new Set(recipe.allergens?.contains || []);
  for (const a of Object.keys(CARRIES)) if (contains.has(a) && !lines.some((l) => CARRIES[a](l.name))) contains.delete(a);
  for (const l of lines) for (const a of l._sub?.adds || []) contains.add(a);
  contains = [...contains];

  // asked for a diet the recipe already meets (nothing violates it, so nothing needed swapping)
  const already = changes.length ? [] : tags.filter((t) => VIOLATES[t] && !lines.some((l) => VIOLATES[t](l.name)));

  return { tags, already, servings: { before, after }, changes, notes, remaining, complete: remaining.length === 0 && (changes.length > 0 || after !== before), contains, lines };
};

const loadFor = async (userId, recipeId) => {
  if (!mongoose.isValidObjectId(recipeId)) throw httpError('Recipe not found', 404);
  const [recipe, user] = await Promise.all([
    Recipe.findOne({ _id: recipeId, $or: [{ ...PUBLISHED_FILTER }, { createdBy: userId }] }).lean().exec(),
    User.findById(userId).select('onboarding').lean().exec(),
  ]);
  if (!recipe) throw httpError('Recipe not found', 404);
  const profile = await planProfile(userId, user?.onboarding || {});
  return { recipe, avoid: new Set((profile.allergies || []).map(normaliseAllergen)) };
};

const LABELS = { dairy_free: 'Dairy-free', gluten_free: 'Gluten-free', vegan: 'Vegan', vegetarian: 'Vegetarian', healthier: 'Healthier', protein: 'Higher protein' };

// why there is nothing to save, in plain words (null when there is something)
const nothingMessage = (r) => {
  if (r.changes.length || r.servings.before !== r.servings.after) return null;
  const names = r.tags.map((t) => LABELS[t].toLowerCase());
  if (r.already.length && r.already.length === r.tags.length) return `This recipe already looks ${names.join(' and ')}, so there is nothing to change.`;
  return `Mealist has no safe swap for "${names.join(', ') || 'that'}" in this recipe. Try a different request.`;
};

const kcalOf = (n) => (n && n.status !== 'none' && n.perServing ? Math.round(n.perServing.kcal) : null);

const strip = ({ _sub, _group, ...line }) => line;

// preview: saves nothing
const preview = async (userId, recipeId, prompt) => {
  const escalation = await safetyEscalation.screen(userId, prompt);
  if (escalation) return { escalation };
  const { recipe, avoid } = await loadFor(userId, recipeId);
  const r = adaptRecipe(recipe, prompt, avoid);
  // per-serving nutrition only changes when an ingredient is swapped; skip the slow USDA estimate otherwise
  const nutrition = r.changes.length
    ? await estimateFromLines(r.lines.map(strip), r.servings.after).catch(() => ({ status: 'none', perServing: null }))
    : recipe.nutrition || { status: 'none', perServing: null };
  return {
    recipeId: String(recipe._id),
    message: nothingMessage(r),
    title: recipe.title,
    servings: r.servings,
    changes: r.changes,
    notes: r.notes,
    remaining: r.remaining,
    complete: r.complete,
    nutrition: { beforeKcal: kcalOf(recipe.nutrition), afterKcal: kcalOf(nutrition), status: nutrition.status },
  };
};


// saves the adaptation as the user's own recipe, linked to its parent. Recomputed here: nothing from the client.
const saveVersion = async (userId, recipeId, prompt) => {
  const escalation = await safetyEscalation.screen(userId, prompt);
  if (escalation) return { escalation };
  const { recipe, avoid } = await loadFor(userId, recipeId);
  const r = adaptRecipe(recipe, prompt, avoid);
  if (!r.complete) throw httpError(r.remaining.length ? `I couldn't fully do that: ${r.remaining.join(', ')} can't be swapped from my table.` : 'Nothing to change for that request.', 422);

  const rootId = recipe.parentRecipeId || recipe._id;
  const version = ((await Recipe.findOne({ $or: [{ _id: rootId }, { parentRecipeId: rootId }], createdBy: { $in: [userId, null] } }).sort({ version: -1 }).select('version').lean().exec())?.version || 1) + 1;
  const label = r.tags.map((t) => LABELS[t]).join(', ') || `For ${r.servings.after}`;
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const nutrition = await estimateFromLines(r.lines.map(strip), r.servings.after).catch(() => ({ status: 'none', perServing: null }));

  const doc = await Recipe.create({
    externalId: `USR-${suffix.toUpperCase()}`,
    slug: `user-${suffix}`,
    title: `${recipe.title} (${label})`,
    summary: recipe.summary,
    createdBy: userId,
    updatedBy: 'User',
    parentRecipeId: rootId,
    version,
    source: { type: 'adapted', name: prompt.slice(0, 120), importedAt: new Date() },
    media: recipe.media,
    meta: recipe.meta,
    timing: recipe.timing,
    yield: { servings: r.servings.after, servingUnit: recipe.yield?.servingUnit },
    // curated swaps on a recipe whose own allergen data was already trusted; otherwise stays unverified
    allergens: { contains: r.contains, freeFrom: (recipe.allergens?.freeFrom || []).filter((a) => !r.contains.includes(a)), verified: recipe.createdBy ? Boolean(recipe.allergens?.verified) : true },
    nutrition,
    ingredientGroups: [{ groupName: 'Ingredients', ingredients: r.lines.map(strip) }],
    instructionSteps: recipe.instructionSteps,
  });
  return { id: String(doc._id), title: doc.title, version };
};

// the original plus the user's adapted versions of it, oldest first
const versions = async (userId, recipeId) => {
  const { recipe } = await loadFor(userId, recipeId);
  const rootId = recipe.parentRecipeId || recipe._id;
  const docs = await Recipe.find({ $or: [{ _id: rootId }, { parentRecipeId: rootId }] }).select('title version createdBy source createdAt').lean().exec();
  return docs
    .filter((d) => !d.createdBy || String(d.createdBy) === String(userId))
    .sort((a, b) => (a.version || 1) - (b.version || 1))
    .map((d) => ({ id: String(d._id), title: d.title, version: d.version || 1, summary: d.source?.name || 'Original', current: String(d._id) === String(recipe._id) }));
};

module.exports = { adaptRecipe, readIntent, nothingMessage, preview, saveVersion, versions, SUPPORTED };
