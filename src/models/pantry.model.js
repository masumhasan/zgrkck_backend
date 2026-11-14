const mongoose = require('mongoose');

const pantryItemSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Ingredient name is required'],
      trim: true,
      index: true,
    },
    storedIn: {
      type: String,
      enum: ['Fridge', 'Freezer', 'Pantry'],
      default: 'Pantry',
      index: true,
    },
    qty: {
      type: String,
      default: '1',
      trim: true,
    },
    unit: {
      type: String,
      default: 'pcs',
      trim: true,
    },
    urgency: {
      type: String,
      default: null,
    },
    useBy: {
      type: String,
      default: null, // 'YYYY-MM-DD'
    },
    addedOn: {
      type: String,
      default: () => new Date().toISOString().split('T')[0],
    },
    imageUrl: {
      type: String,
      default: null,
    },
    ingredientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ingredient',
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

pantryItemSchema.index({ userId: 1, storedIn: 1 });
pantryItemSchema.index({ userId: 1, name: 1 });

const PantryItem = mongoose.model('PantryItem', pantryItemSchema);

module.exports = { PantryItem };

