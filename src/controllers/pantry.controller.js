const pantryService = require('../services/pantry.service');
const { successResponse } = require('../utils/response.util');

class PantryController {
  async getPantry(req, res, next) {
    try {
      const data = await pantryService.getUserPantry(req.user.id);
      return successResponse(res, data, 'Pantry inventory retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  async addItem(req, res, next) {
    try {
      if (!req.body.name || req.body.name.trim().length === 0) {
        return res.status(400).json({ success: false, message: 'Ingredient name is required' });
      }
      const item = await pantryService.addItem(req.user.id, req.body);
      return successResponse(res, item, 'Item added to pantry successfully', 201);
    } catch (err) {
      next(err);
    }
  }

  async updateItem(req, res, next) {
    try {
      const item = await pantryService.updateItem(req.user.id, req.params.id, req.body);
      return successResponse(res, item, 'Pantry item updated successfully');
    } catch (err) {
      next(err);
    }
  }

  async deleteItem(req, res, next) {
    try {
      const result = await pantryService.deleteItem(req.user.id, req.params.id);
      return successResponse(res, result, 'Pantry item deleted successfully');
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new PantryController();

