const https = require('https');
const mongoose = require('mongoose');
const { Recipe } = require('../models/recipe.model');
const { PantryItem } = require('../models/pantry.model');
const { User } = require('../models/user.model');
const { config } = require('../config/env');
const { buildSafeFilter, filterSafe, escapeRegex } = require('./safety_filter.service');

// explore service — handles AI semantic search and personalized surprise me recommendations
class ExploreService {
  // Call OpenAI with timeout and graceful fallback
  async _callOpenAI(prompt) {
    if (!config.openaiApiKey || config.openaiApiKey.includes('PLACEHOLDER')) {
      return null;
    }
    return new Promise((resolve) => {
      const payload = JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        response_format: { type: 'json_object' },
      });

      const req = https.request(
        {
          hostname: 'api.openai.com',
          path: '/v1/chat/completions',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.openaiApiKey}`,
          },
          timeout: 4000,
        },
        (res) => {
          let body = '';
          res.on('data', (c) => (body += c));
          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              try {
                const data = JSON.parse(body);
                resolve(JSON.parse(data.choices[0].message.content));
              } catch (_) {
                resolve(null);
              }
            } else {
              resolve(null);
            }
          });
        }
      );
      req.on('error', () => resolve(null));
      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
      req.write(payload);
      req.end();
    });
  }

  // Smart local NLP parser for recipe search query
  _localParseIntent(query = '') {
    const q = query.toLowerCase();
    const proteinChips = [];
    const keywordChips = [];
    const timeChips = [];
    const keywords = [];
    let maxMinutes = null;
    let minProtein = null;

    // 1. Detect protein
    if (q.includes('high protein') || q.includes('high-protein') || q.includes('protein')) {
      minProtein = 35;
      proteinChips.push('High-Protein (>35g)');
    }

    // 2. Detect key ingredients
    const commonIngredients = [
      'chicken', 'salmon', 'beef', 'pasta', 'rice', 'shrimp', 'turkey',
      'tofu', 'egg', 'eggs', 'salad', 'soup', 'lentil', 'lentils', 'pork'
    ];
    for (const ing of commonIngredients) {
      if (q.includes(ing)) {
        keywords.push(ing);
        const capitalized = ing.charAt(0).toUpperCase() + ing.slice(1);
        if (!keywordChips.includes(capitalized)) keywordChips.push(capitalized);
      }
    }

    // 3. Detect time
    const timeMatch = q.match(/(\d+)\s*(?:min|minute|mins)/i);
    if (timeMatch) {
      maxMinutes = parseInt(timeMatch[1], 10);
      timeChips.push(`< ${maxMinutes} mins`);
    } else if (q.includes('quick') || q.includes('fast')) {
      maxMinutes = 30;
      timeChips.push('< 30 mins');
    }

    const chips = [...proteinChips, ...keywordChips, ...timeChips];
    if (chips.length === 0) {
      chips.push(query.trim() || 'Curated Recipes');
    }

    return { understoodChips: chips, keywords, maxMinutes, minProtein };
  }

  // Parse natural search query into structured intent
  async parseSearchIntent(query = '') {
    const prompt = `You are an AI for Mealist app. Analyze recipe query: "${query}".
Return JSON format:
{
  "understoodChips": ["High-Protein (>35g)", "Chicken", "< 30 mins"],
  "keywords": ["chicken"],
  "maxMinutes": 30,
  "minProtein": 35
}
Rules: understoodChips must be 2-4 short badges. keywords must be 1-3 food terms. maxMinutes and minProtein are numbers or null.`;

    const aiResult = await this._callOpenAI(prompt);
    if (aiResult && Array.isArray(aiResult.understoodChips) && aiResult.understoodChips.length > 0) {
      return {
        understoodChips: aiResult.understoodChips,
        keywords: Array.isArray(aiResult.keywords) ? aiResult.keywords : [],
        maxMinutes: typeof aiResult.maxMinutes === 'number' ? aiResult.maxMinutes : null,
        minProtein: typeof aiResult.minProtein === 'number' ? aiResult.minProtein : null,
      };
    }
    return this._localParseIntent(query);
  }

  // Search recipes with AI query parsing and user personalization
  async aiSearchRecipes(user, query = '') {
    const intent = await this.parseSearchIntent(query);
    const onboarding = user?.onboarding || {};
    // Every search starts from the full safety filter (allergies, diet, religion, avoid-list)
    const filter = buildSafeFilter(onboarding);
    const applied = [];
    if (!onboarding.hasNoRestrictions && onboarding.allergies?.length) applied.push(`${onboarding.allergies.join(', ')}-free`);
    if (onboarding.dietaryPreference && onboarding.dietaryPreference !== 'No preference') applied.push(onboarding.dietaryPreference);
    const profileNote = applied.length ? `Filtered for: ${applied.join(' · ')} (auto-applied from profile)` : null;

    // Keywords filter
    if (intent.keywords.length > 0) {
      const regexes = intent.keywords.map((k) => new RegExp(escapeRegex(k), 'i'));
      filter.$or = [
        { title: { $in: regexes } },
        { 'ingredientGroups.ingredients.name': { $in: regexes } },
        { 'meta.tags': { $in: regexes } },
      ];
    } else if (query.trim()) {
      const rx = new RegExp(escapeRegex(query.trim()), 'i');
      filter.$or = [{ title: rx }, { summary: rx }, { 'meta.tags': rx }];
    }

    // Total time constraint
    if (intent.maxMinutes) {
      filter['timing.totalMinutes'] = { $lte: intent.maxMinutes + 5 };
    }

    let docs = await Recipe.find(filter).limit(35).lean().exec();

    // Fallback relaxation if strict query yielded too few
    if (docs.length < 4 && intent.maxMinutes) {
      delete filter['timing.totalMinutes'];
      docs = await Recipe.find(filter).limit(35).lean().exec();
    }
    // never widen past the safety filter; re-check results in code
    docs = filterSafe(docs, onboarding);

    // Sort: recipes with keyword in title rank highest
    if (intent.keywords.length > 0) {
      const kw = intent.keywords[0].toLowerCase();
      docs.sort((a, b) => {
        const aHas = (a.title || '').toLowerCase().includes(kw);
        const bHas = (b.title || '').toLowerCase().includes(kw);
        if (aHas && !bHas) return -1;
        if (!aHas && bHas) return 1;
        return 0;
      });
    }

    // only facts we actually know: no invented match scores, calories or protein
    const recipes = docs.map((doc) => {
      const minutes = doc.timing?.totalMinutes || (doc.timing?.cookMinutes || 0) + (doc.timing?.prepMinutes || 0) || 0;
      const kw = intent.keywords.find((k) => (doc.title || '').toLowerCase().includes(k.toLowerCase()));
      const facts = [];
      if (kw) facts.push(`Matches "${kw}"`);
      if (doc.meta?.cuisines?.[0]?.name) facts.push(`${doc.meta.cuisines[0].name} cuisine`);
      if (minutes) facts.push(`Ready in ${minutes} min`);

      return {
        _id: doc._id.toString(),
        id: doc._id.toString(),
        title: doc.title,
        time: minutes ? `${minutes} min` : '',
        insight: facts.join(' · '),
        image: doc.media?.imageUrl || '',
      };
    });

    return {
      understoodChips: intent.understoodChips,
      profileNote,
      total: recipes.length,
      recipes,
    };
  }

  // Get personalized surprise recipe based on body, goals, and pantry
  async getSurpriseRecipe(user, { filter = 'Something new', excludeId = '' } = {}) {
    const onboarding = user?.onboarding || {};
    const query = buildSafeFilter(onboarding);

    if (excludeId && /^[a-f0-9]{24}$/i.test(String(excludeId))) {
      query._id = { $ne: new mongoose.Types.ObjectId(String(excludeId)) }; // aggregate does not cast strings
    }

    // Apply tab filter criteria
    if (filter === 'Quick') {
      // never looser than the user's own cooking-time limit from the safe filter
      const ownLimit = query['timing.totalMinutes']?.$lte;
      query['timing.totalMinutes'] = { $gt: 0, $lte: Math.min(30, ownLimit || 30) };
    } else if (filter === 'High Protein') {
      query.$or = [
        { 'ingredientGroups.ingredients.name': { $in: [/chicken/i, /salmon/i, /beef/i, /lentil/i, /egg/i] } },
        { 'meta.tags': { $in: ['high-protein', 'meat', 'seafood'] } },
      ];
    }

    // Only the app's own recipe library: `query` starts from the safe filter, which already limits
    // it to published dataset recipes (no user-created or held-back ones). $sample draws from the
    // whole matching library, not just the first 40 documents.
    const candidates = filterSafe(
      await Recipe.aggregate([{ $match: query }, { $sample: { size: 40 } }]).exec(),
      onboarding
    );
    if (candidates.length === 0) return null;

    // pantry overlap is computed from real data; 'Use what I have' prefers the best overlap
    const pantryNames = user?._id
      ? (await PantryItem.find({ userId: user._id }).select('name').lean().exec()).map((i) => i.name.trim().toLowerCase()).filter(Boolean)
      : [];
    const overlapOf = (r) => {
      const have = (r.ingredientGroups || []).flatMap((g) => g.ingredients.map((i) => i.name.toLowerCase()));
      return pantryNames.filter((n) => have.some((h) => h.includes(n)));
    };
    let pool = candidates;
    if (filter === 'Use what I have') {
      const scored = candidates.map((r) => ({ r, used: overlapOf(r) })).filter((x) => x.used.length);
      if (!scored.length) return null;
      const best = Math.max(...scored.map((x) => x.used.length));
      pool = scored.filter((x) => x.used.length === best).map((x) => x.r);
    }
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    const used = overlapOf(chosen);

    const totalMins = chosen.timing?.totalMinutes || 0;
    const reasons = [];
    const cuisine = chosen.meta?.cuisines?.[0]?.name;
    if (cuisine && (onboarding.favouriteCuisines || []).some((c) => c.toLowerCase() === cuisine.toLowerCase())) {
      reasons.push(`You like ${cuisine} food`);
    } else if (cuisine) {
      reasons.push(`${cuisine} cuisine`);
    }
    if (totalMins) reasons.push(`Ready in ${totalMins} minutes`);
    if (used.length) reasons.push(`Uses ${used.slice(0, 3).join(', ')} from your pantry`);

    return {
      _id: chosen._id.toString(),
      id: chosen._id.toString(),
      title: chosen.title,
      time: totalMins ? `${totalMins} min` : '',
      reason: reasons.join(' · ') || 'Picked from recipes that fit your profile',
      image: chosen.media?.imageUrl || '',
    };
  }
}

module.exports = new ExploreService();
