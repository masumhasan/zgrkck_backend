const express = require('express');
const shoppingController = require('../controllers/shopping.controller');
const { authGuard } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validation.middleware');
const { bulkAddItemsSchema } = require('../validators/shopping.validator');

const router = express.Router();

router.use(authGuard);

router.get('/', shoppingController.getShoppingList.bind(shoppingController));
router.post('/items', shoppingController.addItem.bind(shoppingController));
router.post('/items/bulk', validate(bulkAddItemsSchema), shoppingController.addItems.bind(shoppingController));
router.post('/toggle', shoppingController.toggleItem.bind(shoppingController));
router.delete('/checked', shoppingController.clearChecked.bind(shoppingController));
router.post('/finish', shoppingController.finish.bind(shoppingController));

module.exports = router;

