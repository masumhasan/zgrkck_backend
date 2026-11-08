const mongoose = require('mongoose');

const UserRole = {
  USER: 'user',
  ADMIN: 'admin',
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

module.exports = { User, UserRole };

