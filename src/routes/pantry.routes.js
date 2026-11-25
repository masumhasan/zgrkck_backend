const express = require('express');
const pantryController = require('../controllers/pantry.controller');
const { authGuard } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validation.middleware');
const { addPantryItemSchema, updatePantryItemSchema, parseListSchema, bulkAddSchema } = require('../validators/pantry.validator');
const { createRateLimiter } = require('../middleware/rate_limit.middleware');

const router = express.Router();

router.use(authGuard);

// receipt reading calls the AI service, so it is limited per user (same as recipe import)
const scanLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 20, keyFn: (req) => req.user.id });

router.get('/', pantryController.getPantry.bind(pantryController));
router.get('/what-can-i-cook', pantryController.whatCanICook.bind(pantryController));
router.post('/parse', validate(parseListSchema), pantryController.parseList.bind(pantryController));
router.post('/scan', scanLimiter, express.raw({ type: ['image/*', 'application/octet-stream'], limit: '8mb' }), pantryController.scanReceipt.bind(pantryController));
router.post('/bulk', validate(bulkAddSchema), pantryController.addMany.bind(pantryController));
router.post('/', validate(addPantryItemSchema), pantryController.addItem.bind(pantryController));
router.put('/:id', validate(updatePantryItemSchema), pantryController.updateItem.bind(pantryController));
router.delete('/:id', pantryController.deleteItem.bind(pantryController));

module.exports = router;

