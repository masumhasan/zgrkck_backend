const { configured, chatJson } = require('./openai_json.service');

// "Compose (LLM)" step of the plan pipeline (AI layer contract): retrieve -> hard filter (code) -> rank (code)
// -> COMPOSE (this) -> validate (code). The model sees only already-safe candidates (ids, titles, times) and
// no personal data, and may only ARRANGE them. Every answer is validated below; a slot the model gets wrong
// is dropped and the caller falls back to the deterministic rotation for that slot (single-slot retry, never
// the whole week). With no key, a failed call or a bad answer the plan is simply built as before.
const MIN_SLOTS = 3; // cost control: one call per generation, and not worth it for one or two meals

const SYSTEM =
  'You arrange a meal plan. Choose ONLY recipes from the candidates list, by their id. Fit each recipe to the ' +
  'meal type it lists. Do not repeat a recipe, and avoid the same cuisine or main ingredient on consecutive days. ' +
  'Reply as JSON: {"slots":[{"date":"YYYY-MM-DD","mealType":"DINNER","recipeId":"<id>"}]}';

const slotKey = (date, type) => `${date}|${type}`;

// raw: what the model returned. Returns Map(slotKey -> recipe) of the entries that pass every check.
const validateComposition = (raw, slots, candidatesById, pools) => {
  const out = new Map();
  const wanted = new Set(slots.map((s) => slotKey(s.date, s.type)));
  const used = new Set();
  const enoughToAvoidRepeats = candidatesById.size >= slots.length;
  for (const entry of Array.isArray(raw?.slots) ? raw.slots : []) {
    const type = String(entry?.mealType || '').toUpperCase();
    const key = slotKey(entry?.date, type);
    const recipe = candidatesById.get(String(entry?.recipeId));
    if (!wanted.has(key) || out.has(key) || !recipe) continue; // unknown slot, duplicate slot, or not one of our candidates
    if (!(pools[type] || []).some((r) => String(r._id) === String(recipe._id))) continue; // wrong meal type
    if (enoughToAvoidRepeats && used.has(String(recipe._id))) continue;
    const prev = new Date(`${entry.date}T00:00:00Z`); // UTC: local midnight + toISOString would shift the date
    prev.setUTCDate(prev.getUTCDate() - 1);
    const yesterday = out.get(slotKey(prev.toISOString().slice(0, 10), type));
    if (yesterday && String(yesterday._id) === String(recipe._id)) continue; // same recipe two days running
    used.add(String(recipe._id));
    out.set(key, recipe);
  }
  return out;
};

const describe = (r) => ({
  id: String(r._id),
  title: r.title,
  mealTypes: r.meta?.mealTypes || [],
  cuisines: (r.meta?.cuisines || []).map((c) => c.name),
  minutes: r.timing?.totalMinutes || null,
  kcal: r.nutrition?.perServing?.kcal ? Math.round(r.nutrition.perServing.kcal) : null,
});

// slots: [{ date, type }]; candidates: the safe, ranked recipes; pools: type -> eligible recipes
const composePlan = async ({ slots, candidates, pools, chat = chatJson, isConfigured = configured }) => {
  if (!isConfigured() || slots.length < MIN_SLOTS || !candidates.length) return new Map();
  try {
    const raw = await chat({
      system: SYSTEM,
      userText: JSON.stringify({ slots: slots.map((s) => ({ date: s.date, mealType: s.type })), candidates: candidates.map(describe) }),
      timeoutMs: 20000,
    });
    return validateComposition(raw, slots, new Map(candidates.map((r) => [String(r._id), r])), pools);
  } catch (err) {
    console.error('Plan compose skipped:', err.message);
    return new Map();
  }
};

module.exports = { composePlan, validateComposition, slotKey, MIN_SLOTS };
