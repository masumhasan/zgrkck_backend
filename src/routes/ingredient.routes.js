const express = require('express');
const ingredientController = require('../controllers/ingredient.controller');

const router = express.Router();

router.get('/', ingredientController.search.bind(ingredientController));
router.get('/:id', ingredientController.getById.bind(ingredientController));

module.exports = router;

