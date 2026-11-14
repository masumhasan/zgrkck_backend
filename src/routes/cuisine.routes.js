const express = require('express');
const cuisineController = require('../controllers/cuisine.controller');

const router = express.Router();

router.get('/', (req, res, next) => cuisineController.getAllCuisines(req, res, next));

module.exports = router;

