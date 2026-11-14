const cuisineService = require('../services/cuisine.service');
const { successResponse } = require('../utils/response.util');

class CuisineController {
  async getAllCuisines(req, res, next) {
    try {
      const cuisines = await cuisineService.getAllCuisines();
      return successResponse(res, cuisines, 'Cuisines retrieved successfully');
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new CuisineController();

