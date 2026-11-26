const { Legal } = require('../models/legal.model');

const DEFAULT_LEGAL = {
  key: 'default',
  lastUpdated: 'Last updated November 2026',
  disclaimer:
    '**Food safety and allergens**\n\n' +
    'Mealist excludes recipes containing allergens you have listed, where those are identified in our data. ' +
    'Packaged products can contain traces that a recipe never mentions, and imported recipes are only as complete as their source.\n\n' +
    '**Always verify ingredients and product labels.**',
  terms:
    '**1. Using Mealist**\n' +
    'Mealist provides meal planning, recipes and grocery organisation for general use. It is not a medical or nutrition service and does not manage medical conditions or therapeutic diets.\n\n' +
    '**2. Nutrition information**\n' +
    'Calorie and macro figures are estimates. Values on imported and AI-adapted recipes are calculated, not verified. Targets are guidance, not medical advice. Talk to a doctor or dietitian before making big changes.\n\n' +
    '**3. Your content**\n' +
    'Recipes you import stay in your private library with a link to their source. We do not redistribute them or use your content to train models without your explicit opt-in.\n\n' +
    '**4. AI suggestions**\n' +
    'Plans, recommendations and adaptations are suggestions. Every one can be edited, swapped or undone. Allergen and diet exclusions are applied by rules in our code, never decided by an AI model.',
  privacy:
    '**What we collect**\n' +
    'Your account details, the preferences you choose during setup, your plans, pantry, shopping list and the meals you cook. Body data (age, height, weight) is optional and only used to recommend nutrition targets.\n\n' +
    '**How it is protected**\n' +
    'Allergies, restrictions and body data are treated as health data. We never sell your data.\n\n' +
    '**Model training**\n' +
    'Your recipes and requests are not used to train models unless you opt in, and you can withdraw that at any time.\n\n' +
    '**Your choices**\n' +
    'You can export or delete your data yourself from Settings. Deleted accounts are purged within 30 days. Marketing emails are separate from these terms and can be turned off at any time.',
};

const monthYearLabel = () => {
  const now = new Date();
  const month = now.toLocaleString('en-US', { month: 'long' });
  return `Last updated ${month} ${now.getFullYear()}`;
};

async function getLegal() {
  let doc = await Legal.findOne({ key: 'default' }).lean().exec();
  if (!doc) {
    doc = (await Legal.create(DEFAULT_LEGAL)).toObject();
  }
  return {
    lastUpdated: doc.lastUpdated || DEFAULT_LEGAL.lastUpdated,
    disclaimer: doc.disclaimer ?? DEFAULT_LEGAL.disclaimer,
    terms: doc.terms ?? DEFAULT_LEGAL.terms,
    privacy: doc.privacy ?? DEFAULT_LEGAL.privacy,
  };
}

async function updateLegal(body = {}) {
  const update = { lastUpdated: monthYearLabel() };
  for (const field of ['disclaimer', 'terms', 'privacy']) {
    if (typeof body[field] === 'string') {
      update[field] = body[field].slice(0, 20000);
    }
  }
  const doc = await Legal.findOneAndUpdate(
    { key: 'default' },
    { $set: update, $setOnInsert: { key: 'default' } },
    { upsert: true, returnDocument: 'after' }
  ).lean().exec();
  return {
    lastUpdated: doc.lastUpdated,
    disclaimer: doc.disclaimer,
    terms: doc.terms,
    privacy: doc.privacy,
  };
}

module.exports = { getLegal, updateLegal, DEFAULT_LEGAL };
