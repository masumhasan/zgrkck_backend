const express = require('express');
const adminRecipeService = require('../services/admin_recipe.service');
const adminAuthService = require('../services/admin_auth.service');
const { authGuard, requireRole } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validation.middleware');
const { createRecipeSchema, recipeStatusSchema } = require('../validators/admin.validator');
const { successResponse } = require('../utils/response.util');

const router = express.Router();

router.use(authGuard, requireRole('admin'));

const adminName = async (req) => (await adminAuthService.getProfile(req.user.id, req)).name;

router.get('/', async (req, res, next) => {
  try {
    return successResponse(res, await adminRecipeService.list(req.query), 'Recipes retrieved');
  } catch (err) {
    next(err);
  }
});

router.get('/cuisines', async (req, res, next) => {
  try {
    return successResponse(res, await adminRecipeService.cuisineOptions(), 'Cuisines retrieved');
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    return successResponse(res, await adminRecipeService.getById(req.params.id), 'Recipe retrieved');
  } catch (err) {
    next(err);
  }
});

router.post('/', validate(createRecipeSchema), async (req, res, next) => {
  try {
    const recipe = await adminRecipeService.create(req.body, await adminName(req));
    return successResponse(res, recipe, 'Recipe created', 201);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/status', validate(recipeStatusSchema), async (req, res, next) => {
  try {
    const recipe = await adminRecipeService.updateStatus(
      req.params.id,
      req.body.status,
      await adminName(req)
    );
    return successResponse(res, recipe, 'Recipe status updated');
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    return successResponse(res, await adminRecipeService.remove(req.params.id), 'Recipe deleted');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
