const express = require('express');
const pantryController = require('../controllers/pantry.controller');
const { authGuard } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validation.middleware');
const { addPantryItemSchema, updatePantryItemSchema } = require('../validators/pantry.validator');

const router = express.Router();

router.use(authGuard);

router.get('/', pantryController.getPantry.bind(pantryController));
router.post('/', validate(addPantryItemSchema), pantryController.addItem.bind(pantryController));
router.put('/:id', validate(updatePantryItemSchema), pantryController.updateItem.bind(pantryController));
router.delete('/:id', pantryController.deleteItem.bind(pantryController));

module.exports = router;

