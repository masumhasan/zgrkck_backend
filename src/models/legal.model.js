const mongoose = require('mongoose');

const legalSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'default' },
    lastUpdated: { type: String, default: 'Last updated November 2026' },
    disclaimer: { type: String, default: '' },
    terms: { type: String, default: '' },
    privacy: { type: String, default: '' },
  },
  { timestamps: true }
);

const Legal = mongoose.model('Legal', legalSchema);

module.exports = { Legal };
