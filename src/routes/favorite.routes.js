const express = require('express');
const favoriteController = require('../controllers/favorite.controller');
const { authGuard } = require('../middleware/auth.middleware');
const { validateParams } = require('../middleware/validation.middleware');
const { recipeIdParamSchema } = require('../validators/favorite.validator');

// mounted at /api/v1/users/me/favorites
const router = express.Router();

router.use(authGuard);

router.get('/', favoriteController.list.bind(favoriteController));
router.post('/:recipeId', validateParams(recipeIdParamSchema), favoriteController.add.bind(favoriteController));
router.delete('/:recipeId', validateParams(recipeIdParamSchema), favoriteController.remove.bind(favoriteController));

module.exports = router;
