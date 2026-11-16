const express = require('express');
const adminUserService = require('../services/admin_user.service');
const { authGuard, requireRole } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validation.middleware');
const { userStatusSchema, userPlanSchema } = require('../validators/admin.validator');
const { successResponse } = require('../utils/response.util');

const router = express.Router();

router.use(authGuard, requireRole('admin'));

router.get('/', async (req, res, next) => {
  try {
    return successResponse(res, await adminUserService.list(req.query, req), 'Users retrieved');
  } catch (err) {
    next(err);
  }
});

// Declared before "/:id" so "export" is not treated as an id.
router.get('/export', async (req, res, next) => {
  try {
    const csv = await adminUserService.exportCsv(req.query, req);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="mealist_users_export.csv"');
    return res.status(200).send(csv);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    return successResponse(res, await adminUserService.getDetail(req.params.id, req), 'User retrieved');
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/status', validate(userStatusSchema), async (req, res, next) => {
  try {
    const user = await adminUserService.setStatus(req.params.id, req.body.status, req);
    return successResponse(res, user, 'User status updated');
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/plan', validate(userPlanSchema), async (req, res, next) => {
  try {
    const user = await adminUserService.setPlan(req.params.id, req.body.planId, req);
    return successResponse(res, user, 'User plan updated');
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    return successResponse(res, await adminUserService.remove(req.params.id), 'User permanently deleted');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
