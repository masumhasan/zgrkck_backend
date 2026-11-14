const { PantryItem } = require('../models/pantry.model');
const { Ingredient } = require('../models/ingredient.model');

class PantryService {
  _calculateUrgency(useByDateStr) {
    if (!useByDateStr) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const target = new Date(useByDateStr);
    target.setHours(0, 0, 0, 0);

    const diffDays = Math.ceil((target - today) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'Expired';
    if (diffDays === 0) return 'Use today';
    if (diffDays === 1) return 'Use tomorrow';
    if (diffDays <= 4) return `Use in ${diffDays} days`;
    if (diffDays <= 7) return `Use within ${diffDays} days`;
    return null;
  }

  async getUserPantry(userId) {
    const rawItems = await PantryItem.find({ userId })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    const items = rawItems.map((item) => ({
      ...item,
      urgency: this._calculateUrgency(item.useBy) || item.urgency,
    }));

    const fridge = items.filter((i) => i.storedIn === 'Fridge');
    const pantry = items.filter((i) => i.storedIn === 'Pantry');
    const freezer = items.filter((i) => i.storedIn === 'Freezer');

    return {
      total: items.length,
      fridge,
      pantry,
      freezer,
      items,
    };
  }

  async addItem(userId, data) {
    const { name, storedIn = 'Pantry', qty = '1', unit = 'pcs', useBy } = data;

    let imageUrl = data.imageUrl || null;
    let ingredientId = data.ingredientId || null;

    if (!imageUrl) {
      const escaped = name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const matchedIng = await Ingredient.findOne({
        $or: [
          { name: { $regex: `^${escaped}$`, $options: 'i' } },
          { aliases: { $regex: `^${escaped}$`, $options: 'i' } },
        ],
      })
        .select('_id imageUrl')
        .lean()
        .exec();

      if (matchedIng) {
        imageUrl = matchedIng.imageUrl || null;
        ingredientId = matchedIng._id;
      }
    }

    const urgency = this._calculateUrgency(useBy);

    const item = await PantryItem.create({
      userId,
      name: name.trim(),
      storedIn,
      qty: String(qty).trim(),
      unit: String(unit).trim(),
      urgency,
      useBy: useBy || null,
      imageUrl,
      ingredientId,
    });

    return item;
  }

  async updateItem(userId, itemId, data) {
    const updateData = { ...data };
    if (updateData.useBy !== undefined) {
      updateData.urgency = this._calculateUrgency(updateData.useBy);
    }

    const item = await PantryItem.findOneAndUpdate(
      { _id: itemId, userId },
      { $set: updateData },
      { new: true }
    )
      .lean()
      .exec();

    if (!item) {
      const err = new Error('Pantry item not found');
      err.statusCode = 404;
      throw err;
    }
    return item;
  }

  async deleteItem(userId, itemId) {
    const result = await PantryItem.findOneAndDelete({ _id: itemId, userId }).lean().exec();
    if (!result) {
      const err = new Error('Pantry item not found');
      err.statusCode = 404;
      throw err;
    }
    return { success: true };
  }
}

module.exports = new PantryService();

