const shoppingService = require('../services/shopping.service');
const { successResponse } = require('../utils/response.util');

class ShoppingController {
  async getShoppingList(req, res, next) {
    try {
      const data = await shoppingService.getShoppingList(req.user.id);
      return successResponse(res, data, 'Shopping list retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  async addItem(req, res, next) {
    try {
      if (!req.body.name || req.body.name.trim().length === 0) {
        return res.status(400).json({ success: false, message: 'Item name is required' });
      }
      const item = await shoppingService.addItem(req.user.id, req.body);
      return successResponse(res, item, 'Item added to shopping list', 201);
    } catch (err) {
      next(err);
    }
  }

  async toggleItem(req, res, next) {
    try {
      const updated = await shoppingService.toggleItem(req.user.id, req.body);
      return successResponse(res, updated, 'Item state updated');
    } catch (err) {
      next(err);
    }
  }

  async clearChecked(req, res, next) {
    try {
      const result = await shoppingService.clearChecked(req.user.id);
      return successResponse(res, result, 'Checked items cleared');
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new ShoppingController();

