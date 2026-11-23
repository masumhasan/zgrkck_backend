const favoriteService = require('../services/favorite.service');
const { successResponse, errorResponse } = require('../utils/response.util');

class FavoriteController {
  async list(req, res, next) {
    try {
      const data = await favoriteService.list(req.user.id);
      return successResponse(res, data, 'Favourite recipes retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  async add(req, res, next) {
    try {
      const ok = await favoriteService.add(req.user.id, req.params.recipeId);
      if (!ok) return errorResponse(res, 'Recipe not found', 404);
      return successResponse(res, { recipeId: req.params.recipeId, isFavorite: true }, 'Added to favourites');
    } catch (err) {
      next(err);
    }
  }

  async remove(req, res, next) {
    try {
      await favoriteService.remove(req.user.id, req.params.recipeId);
      return successResponse(res, { recipeId: req.params.recipeId, isFavorite: false }, 'Removed from favourites');
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new FavoriteController();
