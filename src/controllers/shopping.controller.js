const shoppingService = require('../services/shopping.service');
const shoppingFinishService = require('../services/shopping_finish.service');
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

  // body already validated by bulkAddItemsSchema
  async addItems(req, res, next) {
    try {
      const result = await shoppingService.addItems(req.user.id, req.body.items);
      const n = result.added.length;
      const message = n
        ? `${n} item${n === 1 ? '' : 's'} added to your shopping list`
        : 'Everything is already on your shopping list';
      return successResponse(res, result, message, n ? 201 : 200);
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

  // finish a shopping trip: collected items go into the pantry, then the checked rows are cleared
  async finish(req, res, next) {
    try {
      const result = await shoppingFinishService.finish(req.user.id, { names: req.body?.names });
      const message = result.count
        ? `${result.count} item${result.count === 1 ? '' : 's'} added to your pantry`
        : 'Nothing was collected';
      return successResponse(res, result, message);
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

