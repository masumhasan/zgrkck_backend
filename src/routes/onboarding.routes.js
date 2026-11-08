const express = require('express');
const onboardingController = require('../controllers/onboarding.controller');
const { authGuard } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validation.middleware');
const { onboardingSchema } = require('../validators/onboarding.validator');

const router = express.Router();

router.use(authGuard);

router.post(
  '/',
  validate(onboardingSchema),
  onboardingController.saveOnboarding.bind(onboardingController)
);

router.get(
  '/status',
  onboardingController.getOnboardingStatus.bind(onboardingController)
);

module.exports = router;

