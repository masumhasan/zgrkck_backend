const express = require('express');
const dashboardService = require('../services/admin_dashboard.service');
const activityService = require('../services/activity.service');
const safetyEscalation = require('../services/safety_escalation.service');
const { authGuard, requireRole } = require('../middleware/auth.middleware');
const { successResponse } = require('../utils/response.util');

const router = express.Router();

router.use(authGuard, requireRole('admin'));

router.get('/overview', async (req, res, next) => {
  try {
    return successResponse(res, await dashboardService.getOverview(req), 'Dashboard overview retrieved');
  } catch (err) {
    next(err);
  }
});

// REQ-SAFE-13: monthly safety counts, zeros included
router.get('/safety', async (req, res, next) => {
  try {
    return successResponse(res, await safetyEscalation.counts(Number(req.query.days) || 30), 'Safety report retrieved');
  } catch (err) {
    next(err);
  }
});

router.get('/usage', async (req, res, next) => {
  try {
    return successResponse(res, await dashboardService.getUsageOverview(), 'Usage overview retrieved');
  } catch (err) {
    next(err);
  }
});

router.get('/activity', async (req, res, next) => {
  try {
    return successResponse(res, await activityService.recent(req.query.limit), 'Recent activity retrieved');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
