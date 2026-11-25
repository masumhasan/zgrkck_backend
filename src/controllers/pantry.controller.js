const pantryService = require('../services/pantry.service');
const whatCanICookService = require('../services/what_can_i_cook.service');
const bulk = require('../services/pantry_bulk.service');
const { successResponse, errorResponse } = require('../utils/response.util');

class PantryController {
  async getPantry(req, res, next) {
    try {
      const data = await pantryService.getUserPantry(req.user.id);
      return successResponse(res, data, 'Pantry inventory retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  // ?members=me,<memberId>,...  (omitted = everyone)  &guests=2
  async whatCanICook(req, res, next) {
    try {
      const memberIds = String(req.query.members || '').split(',').map((s) => s.trim()).filter((s) => s === 'me' || /^[a-f0-9]{24}$/i.test(s));
      const data = await whatCanICookService.whatCanICook(req.user.id, { memberIds, guests: Number(req.query.guests) });
      return successResponse(res, data, 'Pantry matches retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  // typed list -> review rows (nothing saved)
  async parseList(req, res, next) {
    try {
      return successResponse(res, { items: await bulk.parse(req.body.text) }, 'List read successfully');
    } catch (err) {
      next(err);
    }
  }

  // receipt photo -> review rows (nothing saved)
  async scanReceipt(req, res, next) {
    try {
      return successResponse(res, { items: await bulk.scanReceipt(req.body) }, 'Receipt read successfully');
    } catch (err) {
      if (err.statusCode === 503) return errorResponse(res, err.message, 503); // meant for the user, unlike other 5xx
      next(err);
    }
  }

  // the reviewed list -> pantry
  async addMany(req, res, next) {
    try {
      return successResponse(res, await bulk.addMany(req.user.id, req.body.items), 'Items added to pantry successfully', 201);
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

