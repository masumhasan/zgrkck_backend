const exploreService = require('../services/explore.service');
const { User } = require('../models/user.model');
const { successResponse, errorResponse } = require('../utils/response.util');

// explore controller — manages AI recipe search and personalized surprise-me endpoints
class ExploreController {
  async aiSearch(req, res, next) {
    try {
      const query = req.body?.query || req.query?.query || req.query?.q || '';
      let user = null;
      if (req.user?.userId) {
        user = await User.findById(req.user.userId).lean();
      }

      const result = await exploreService.aiSearchRecipes(user, query);
      return successResponse(res, result, 'Recipes found successfully');
    } catch (err) {
      next(err);
    }
  }

  async getSurpriseMe(req, res, next) {
    try {
      const { filter = 'Something new', excludeId = '' } = req.query;
      let user = null;
      if (req.user?.userId) {
        user = await User.findById(req.user.userId).lean();
      }

      const result = await exploreService.getSurpriseRecipe(user, { filter, excludeId });
      return successResponse(res, result, 'Surprise recipe fetched successfully');
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new ExploreController();

