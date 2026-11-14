const mongoose = require('mongoose');

const shoppingItemSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Item name is required'],
      trim: true,
      index: true,
    },
    category: {
      type: String,
      default: 'Produce',
      trim: true,
    },
    qty: {
      type: String,
      default: '1',
      trim: true,
    },
    unit: {
      type: String,
      default: '',
      trim: true,
    },
    checked: {
      type: Boolean,
      default: false,
      index: true,
    },
    buy: {
      type: String,
      default: null,
    },
    pantry: {
      type: String,
      default: null,
    },
    isManual: {
      type: Boolean,
      default: false,
    },
    recipeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Recipe',
      default: null,
    },
    imageUrl: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

shoppingItemSchema.index({ userId: 1, checked: 1 });

const ShoppingItem = mongoose.model('ShoppingItem', shoppingItemSchema);

module.exports = { ShoppingItem };

