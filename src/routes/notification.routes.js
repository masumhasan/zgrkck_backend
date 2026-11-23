const express = require('express');
const notificationService = require('../services/notification.service');
const triggers = require('../services/notification_triggers.service');
const { authGuard } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validation.middleware');
const { successResponse, errorResponse } = require('../utils/response.util');
const v = require('../validators/notification.validator');

const router = express.Router();
router.use(authGuard);

// validates req.query / req.params with a schema
const check = (schema, key) => (req, res, next) => {
  const { error, value } = schema.validate(req[key], { stripUnknown: true });
  if (error) return errorResponse(res, 'Validation error', 400, error.details.map((d) => d.message));
  req.valid = { ...(req.valid || {}), ...value };
  next();
};

const handle = (message, fn) => async (req, res, next) => {
  try {
    return successResponse(res, await fn(req), message);
  } catch (err) {
    next(err);
  }
};

// a failed trigger check must never hide the inbox
const refresh = (userId) => triggers.refresh(userId).catch((e) => console.error('notification refresh failed:', e.message));

router.get(
  '/',
  check(v.listQuerySchema, 'query'),
  handle('Notifications retrieved', async (req) => {
    await refresh(req.user.id);
    return notificationService.list(req.user.id, req.valid);
  })
);

router.get(
  '/unread-count',
  handle('Unread count retrieved', async (req) => {
    await refresh(req.user.id);
    return { unread: await notificationService.unreadCount(req.user.id) };
  })
);

router.get('/preferences', handle('Notification preferences retrieved', (req) => notificationService.getPrefs(req.user.id)));
router.put('/preferences', validate(v.prefsSchema), handle('Notification preferences updated', (req) => notificationService.updatePrefs(req.user.id, req.body)));

router.patch('/read-all', handle('All notifications marked as read', (req) => notificationService.markAllRead(req.user.id)));
router.patch('/:id/read', check(v.idParamSchema, 'params'), handle('Notification marked as read', (req) => notificationService.markRead(req.user.id, req.valid.id)));
router.delete('/:id', check(v.idParamSchema, 'params'), handle('Notification deleted', (req) => notificationService.remove(req.user.id, req.valid.id)));

module.exports = router;
