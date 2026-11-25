const openai = require('./openai_json.service');

// "Draft instructions" in the recipe creator. AI layer contract: the AI only phrases/arranges steps for the
// ingredients the user typed; code validates the output. Nothing is saved here - the user edits the draft first.
const MAX_STEPS = 12;
const httpError = (message, statusCode, code) => Object.assign(new Error(message), { statusCode, code });

const SYSTEM_PROMPT = `You write cooking steps for a home recipe. Return JSON: {"steps": ["..."]}.
Rules: 4-10 short imperative steps in a logical order. Use ONLY the listed ingredients (plus water, salt, pepper and cooking oil).
Do not invent quantities, temperatures or times that the cook did not give. Do not add allergen or health claims.`;

const line = (i) => [i.quantity, i.unit, i.name].filter((p) => p !== undefined && p !== null && p !== '').join(' ');

// anything the model returns that is not a clean list of short strings is dropped
const cleanSteps = (out) =>
  (Array.isArray(out?.steps) ? out.steps : [])
    .filter((s) => typeof s === 'string')
    .map((s) => s.trim().replace(/^\d+[.)]\s*/, ''))
    .filter((s) => s.length > 0 && s.length <= 1000)
    .slice(0, MAX_STEPS);

async function draftSteps({ title = '', ingredients }) {
  if (!openai.configured()) throw httpError("Drafting steps isn't available right now. You can write them yourself.", 503, 'AI_UNAVAILABLE');
  const userText = `Recipe: ${title || 'untitled'}\nIngredients:\n${ingredients.map((i) => `- ${line(i)}`).join('\n')}`;
  let steps;
  try {
    steps = cleanSteps(await openai.chatJson({ system: SYSTEM_PROMPT, userText, timeoutMs: 30000 }));
  } catch {
    throw httpError("Drafting steps isn't available right now. You can write them yourself.", 503, 'AI_UNAVAILABLE');
  }
  if (!steps.length) throw httpError("We couldn't draft steps for these ingredients. Try adding a few more.", 422);
  return steps;
}

module.exports = { draftSteps, cleanSteps };
