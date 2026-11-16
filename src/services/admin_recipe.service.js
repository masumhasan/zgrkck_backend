const { Recipe } = require('../models/recipe.model');
const { Cuisine } = require('../models/cuisine.model');
const { parsePagination, buildPagination, escapeRegex } = require('../utils/pagination.util');
const activityService = require('./activity.service');

const DEFAULT_IMAGE =
  'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80';

const httpError = (message, statusCode) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

const mapRecipeRow = (r) => ({
  id: String(r._id),
  code: r.externalId,
  title: r.title,
  cuisine: r.meta?.cuisines?.[0]?.name || 'Uncategorised',
  status: r.status || 'Published',
  updatedAt: r.updatedAt || r.createdAt,
  updatedBy: r.updatedBy || 'System',
  imageUrl: r.media?.imageUrl || r.media?.thumbnailUrl || DEFAULT_IMAGE,
});

const mapRecipeDetail = (r) => ({
  ...mapRecipeRow(r),
  summary: r.summary || '',
  mealTypes: r.meta?.mealTypes || [],
  tags: r.meta?.tags || [],
  difficulty: r.meta?.difficulty || '',
  prepMinutes: r.timing?.prepMinutes || 0,
  cookMinutes: r.timing?.cookMinutes || 0,
  totalMinutes: r.timing?.totalMinutes || 0,
  servings: r.yield?.servings || 0,
  allergens: r.allergens?.contains || [],
  ingredients: (r.ingredientGroups || []).flatMap((g) =>
    (g.ingredients || []).map((i) => i.displayText || i.name)
  ),
  steps: (r.instructionSteps || [])
    .slice()
    .sort((a, b) => a.stepNumber - b.stepNumber)
    .map((s) => s.instruction),
});

const slugify = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'recipe';

class AdminRecipeService {
  buildFilter({ search, status, cuisine }) {
    const filter = {};
    if (status && ['Published', 'Needs Review', 'Draft'].includes(status)) {
      // Seeded recipes may predate the status field; treat missing as Published.
      filter.status = status === 'Published' ? { $in: ['Published', null] } : status;
    }
    if (cuisine) filter['meta.cuisines.name'] = cuisine;
    if (search && search.trim()) {
      const rx = new RegExp(escapeRegex(search.trim()), 'i');
      filter.$or = [{ title: rx }, { externalId: rx }, { 'meta.cuisines.name': rx }];
    }
    return filter;
  }

  async list(query) {
    const { page, limit, skip } = parsePagination(query);
    const filter = this.buildFilter(query);
    const [rows, total] = await Promise.all([
      Recipe.find(filter)
        .select('externalId title status updatedBy updatedAt createdAt media meta.cuisines')
        .sort({ updatedAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      Recipe.countDocuments(filter),
    ]);
    return { items: rows.map(mapRecipeRow), pagination: buildPagination(page, limit, total) };
  }

  async cuisineOptions() {
    const names = await Cuisine.find().sort({ name: 1 }).distinct('name');
    return names.sort((a, b) => a.localeCompare(b));
  }

  async getById(id) {
    const recipe = await Recipe.findById(id).lean().exec();
    if (!recipe) throw httpError('Recipe not found', 404);
    return mapRecipeDetail(recipe);
  }

  async create(data, adminName) {
    const cuisineDoc = await Cuisine.findOne({ name: data.cuisine }).lean().exec();
    const slugBase = slugify(data.title);
    const suffix = Date.now().toString(36);
    const total = (data.prepMinutes || 0) + (data.cookMinutes || 0);
    const ingredients = data.ingredients || [];

    const recipe = await Recipe.create({
      externalId: `ADM-${suffix.toUpperCase()}`,
      title: data.title,
      slug: `${slugBase}-${suffix}`,
      summary: data.summary || '',
      status: data.status,
      updatedBy: adminName,
      media: { imageUrl: data.imageUrl || DEFAULT_IMAGE, altText: data.title },
      meta: {
        cuisines: [
          {
            id: cuisineDoc?.externalId,
            slug: cuisineDoc?.slug || slugify(data.cuisine),
            name: cuisineDoc?.name || data.cuisine,
          },
        ],
        mealTypes: data.mealType ? [data.mealType] : ['dinner'],
      },
      timing: {
        prepMinutes: data.prepMinutes || 0,
        cookMinutes: data.cookMinutes || 0,
        totalMinutes: total,
      },
      ingredientGroups: ingredients.length
        ? [{ groupName: 'Ingredients', ingredients: ingredients.map((name) => ({ name, displayText: name })) }]
        : [],
      instructionSteps: (data.steps || []).map((instruction, i) => ({ stepNumber: i + 1, instruction })),
    });
    activityService.log('recipe_created', `Recipe "${recipe.title}" added as ${recipe.status}`);
    return mapRecipeDetail(recipe.toObject());
  }

  async updateStatus(id, status, adminName) {
    const recipe = await Recipe.findByIdAndUpdate(
      id,
      { status, updatedBy: adminName },
      { returnDocument: 'after' }
    )
      .lean()
      .exec();
    if (!recipe) throw httpError('Recipe not found', 404);
    activityService.log('recipe_status', `Recipe "${recipe.title}" marked ${status}`);
    return mapRecipeDetail(recipe);
  }

  async remove(id) {
    const recipe = await Recipe.findByIdAndDelete(id).lean().exec();
    if (!recipe) throw httpError('Recipe not found', 404);
    activityService.log('recipe_deleted', `Recipe "${recipe.title}" deleted`);
    return { deleted: true };
  }
}

module.exports = new AdminRecipeService();
