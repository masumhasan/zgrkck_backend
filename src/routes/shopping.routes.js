const express = require('express');
const shoppingController = require('../controllers/shopping.controller');
const { authGuard } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(authGuard);

router.get('/', shoppingController.getShoppingList.bind(shoppingController));
router.post('/items', shoppingController.addItem.bind(shoppingController));
router.post('/toggle', shoppingController.toggleItem.bind(shoppingController));
router.delete('/checked', shoppingController.clearChecked.bind(shoppingController));

module.exports = router;

