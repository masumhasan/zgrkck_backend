const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth.routes');
const onboardingRoutes = require('./routes/onboarding.routes');
const userRoutes = require('./routes/user.routes');
const favoriteRoutes = require('./routes/favorite.routes');
const recipeRoutes = require('./routes/recipe.routes');
const planRoutes = require('./routes/plan.routes');
const ingredientRoutes = require('./routes/ingredient.routes');
const pantryRoutes = require('./routes/pantry.routes');
const householdRoutes = require('./routes/household.routes');
const accountRoutes = require('./routes/account.routes');
const recipeActionRoutes = require('./routes/recipe_actions.routes');
const shoppingRoutes = require('./routes/shopping.routes');
const cuisineRoutes = require('./routes/cuisine.routes');
const notificationRoutes = require('./routes/notification.routes');
const adminAuthRoutes = require('./routes/admin_auth.routes');
const adminUserRoutes = require('./routes/admin_user.routes');
const adminRecipeRoutes = require('./routes/admin_recipe.routes');
const adminPlanRoutes = require('./routes/admin_plan.routes');
const adminDashboardRoutes = require('./routes/admin_dashboard.routes');
const adminNutritionRoutes = require('./routes/admin_nutrition.routes');
const { AVATAR_FILE } = require('./utils/admin_mapper.util');
const { errorHandler } = require('./middleware/error.middleware');
const { config } = require('./config/env');
const legalService = require('./services/legal.service');
const { successResponse } = require('./utils/response.util');

const app = express();

if (config.trustProxy) app.set('trust proxy', Number(config.trustProxy) || config.trustProxy);
app.use(cors(config.corsOrigins.length ? { origin: config.corsOrigins } : undefined));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Liveness check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Placeholder avatar used for all accounts in the admin dashboard
app.get('/assets/user.jpg', (req, res) => {
  res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  res.sendFile(AVATAR_FILE);
});

// Mount modular API v1 routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/onboarding', onboardingRoutes);
app.use('/api/v1/users/me/favorites', favoriteRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/recipes', recipeActionRoutes);
app.use('/api/v1/recipes', recipeRoutes);
app.use('/api/v1/plans', planRoutes);
app.use('/api/v1/ingredients', ingredientRoutes);
app.use('/api/v1/pantry', pantryRoutes);
app.use('/api/v1/household', householdRoutes);
app.use('/api/v1/account', accountRoutes);
app.use('/api/v1/shopping', shoppingRoutes);
app.use('/api/v1/cuisines', cuisineRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.get('/api/v1/legal', async (req, res, next) => {
  try {
    return successResponse(res, await legalService.getLegal(), 'Legal content retrieved');
  } catch (err) {
    next(err);
  }
});

// Admin dashboard API (admin role required except login)
app.use('/api/v1/admin/auth', adminAuthRoutes);
app.use('/api/v1/admin/users', adminUserRoutes);
app.use('/api/v1/admin/recipes', adminRecipeRoutes);
app.use('/api/v1/admin/plans', adminPlanRoutes);
app.use('/api/v1/admin/dashboard', adminDashboardRoutes);
app.use('/api/v1/admin/nutrition', adminNutritionRoutes);

// Global Error Handler
app.use(errorHandler);

module.exports = app;


