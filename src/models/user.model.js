const mongoose = require('mongoose');

const UserRole = {
  USER: 'user',
  ADMIN: 'admin',
};

const UserStatus = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  SUSPENDED: 'suspended',
};

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
      maxlength: 50,
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
      maxlength: 50,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      select: false,
    },
    role: {
      type: String,
      enum: Object.values(UserRole),
      default: UserRole.USER,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(UserStatus),
      default: UserStatus.ACTIVE,
      index: true,
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SubscriptionPlan',
      default: null,
      index: true,
    },
    lastActiveAt: {
      type: Date,
      default: null,
    },
    // REQ-PRO-08: each notification type is switched on/off on its own
    notificationPrefs: {
      planReady: { type: Boolean, default: true },
      shoppingReminder: { type: Boolean, default: true },
      useItUp: { type: Boolean, default: true },
      weeklyReport: { type: Boolean, default: true },
    },
    adminPreferences: {
      notifications: {
        safetyAlerts: { type: Boolean, default: true },
        recipeReviewAlerts: { type: Boolean, default: true },
        systemAlerts: { type: Boolean, default: false },
      },
    },
    onboardingCompleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    personalInfoCompleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    nutritionTarget: {
      calories: { type: Number, default: 1900 },
      protein: { type: Number, default: 130 },
      carbs: { type: Number, default: 210 },
      fat: { type: Number, default: 65 },
      caloriesConsumed: { type: Number, default: 0 },
      proteinConsumed: { type: Number, default: 0 },
      carbsConsumed: { type: Number, default: 0 },
      fatConsumed: { type: Number, default: 0 },
      lastCalculatedAt: { type: Date, default: null },
    },
    // consent record (REQ-ONB-04): which terms version was accepted and when; marketing kept separate
    consents: {
      termsVersion: { type: String, default: null },
      termsAcceptedAt: { type: Date, default: null },
      marketingOptIn: { type: Boolean, default: false },
      marketingUpdatedAt: { type: Date, default: null },
    },
    // what cooking/skipping/swapping taught us: cuisine name (sanitised) -> weight, used to re-rank
    tasteWeights: { type: Map, of: Number, default: {} },
    // catalogue recipes the user added to My Recipes (their own creations are found via Recipe.createdBy)
    savedRecipes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Recipe' }],
    // recipes the user hearted on Recipe Details (separate from the My Recipes bookmark above)
    favoriteRecipes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Recipe' }],
    // daily ranked For You picks; key ties it to the day and the profile it was built for
    forYouCache: {
      key: { type: String, default: null },
      items: [{ _id: false, recipeId: mongoose.Schema.Types.ObjectId, match: Number, reason: String }],
    },
    personalInfo: {
      age: {
        type: Number,
        default: null,
      },
      height: {
        type: Number,
        default: null,
      },
      heightUnit: {
        type: String,
        default: 'cm',
        enum: ['cm', 'ft'],
      },
      weight: {
        type: Number,
        default: null,
      },
      weightUnit: {
        type: String,
        default: 'kg',
        enum: ['kg', 'lbs'],
      },
      gender: {
        type: String,
        default: null,
      },
    },
    onboarding: {
      // Step 1: Goals
      goal: {
        type: String,
        trim: true,
        default: null,
      },
      // Step 2: Dietary Preferences & Nutrition Focuses
      dietaryPreference: {
        type: String,
        trim: true,
        default: 'No preference',
      },
      nutritionFocuses: {
        type: [String],
        default: [],
      },
      // Step 3: Favorite Cuisines
      favouriteCuisines: {
        type: [String],
        default: [],
      },
      // Step 4: Allergies & Exclusions
      hasNoRestrictions: {
        type: Boolean,
        default: false,
      },
      allergies: {
        type: [String],
        default: [],
      },
      dietaryRestrictions: {
        type: [String],
        default: [],
      },
      specificIngredients: {
        type: [String],
        default: [],
      },
      // Step 5: Kitchen Profile
      cookingTime: {
        type: String,
        trim: true,
        default: '15–30 min',
      },
      cookingSkill: {
        type: String,
        trim: true,
        default: 'Comfortable',
      },
      householdType: {
        type: String,
        trim: true,
        default: 'Couple',
      },
      adultsCount: {
        type: Number,
        default: 2,
        min: 0,
      },
      childrenCount: {
        type: Number,
        default: 0,
        min: 0,
      },
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Lean index optimizations
userSchema.index({ email: 1, role: 1 });

const User = mongoose.model('User', userSchema);

module.exports = { User, UserRole, UserStatus };

