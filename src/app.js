const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth.routes');
const onboardingRoutes = require('./routes/onboarding.routes');
const userRoutes = require('./routes/user.routes');
const recipeRoutes = require('./routes/recipe.routes');
const planRoutes = require('./routes/plan.routes');
const ingredientRoutes = require('./routes/ingredient.routes');
const pantryRoutes = require('./routes/pantry.routes');
const shoppingRoutes = require('./routes/shopping.routes');
const cuisineRoutes = require('./routes/cuisine.routes');
const { errorHandler } = require('./middleware/error.middleware');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Liveness check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount modular API v1 routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/onboarding', onboardingRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/recipes', recipeRoutes);
app.use('/api/v1/plans', planRoutes);
app.use('/api/v1/ingredients', ingredientRoutes);
app.use('/api/v1/pantry', pantryRoutes);
app.use('/api/v1/shopping', shoppingRoutes);
app.use('/api/v1/cuisines', cuisineRoutes);

// Global Error Handler
app.use(errorHandler);

module.exports = app;


