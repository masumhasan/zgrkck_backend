const express = require('express');
const pantryController = require('../controllers/pantry.controller');
const { authGuard } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(authGuard);

router.get('/', pantryController.getPantry.bind(pantryController));
router.post('/', pantryController.addItem.bind(pantryController));
router.put('/:id', pantryController.updateItem.bind(pantryController));
router.delete('/:id', pantryController.deleteItem.bind(pantryController));

module.exports = router;

