const { HouseholdMember } = require('../models/household_member.model');
const { User } = require('../models/user.model');

const MAX_MEMBERS = 10;

const httpError = (message, statusCode) => Object.assign(new Error(message), { statusCode });
const uniq = (list) => [...new Set(list)];

// A "person" is the owner (id "me", from onboarding) or a stored member, in one shape.
const ownerPerson = (user) => {
  const o = user.onboarding || {};
  const none = o.hasNoRestrictions; // "no restrictions" switches the owner's allergy/ingredient rules off
  const prefs = [o.dietaryPreference, ...(o.dietaryRestrictions || [])].filter((p) => p && p !== 'No preference');
  return {
    id: 'me',
    name: `${user.firstName} ${user.lastName}`.trim(),
    isOwner: true,
    role: 'adult',
    portionFactor: 1,
    preferences: prefs,
    allergies: none ? [] : o.allergies || [],
    excludedIngredients: none ? [] : o.specificIngredients || [],
    diets: prefs,
  };
};

// Member chips that are really health rules: Gluten-Free / Dairy-Free count as allergies (the safe side),
// Vegetarian / Pescatarian as diets. Everything else (High-Protein, Mediterranean...) is taste only.
const PREF_ALLERGEN = { 'Gluten-Free': 'Gluten', 'Dairy-Free': 'Dairy' };
const PREF_DIET = { Vegetarian: 'vegetarian', Pescatarian: 'pescatarian' };

const memberPerson = (m) => ({
  id: String(m._id),
  name: m.name,
  isOwner: false,
  role: m.role,
  portionFactor: m.portionFactor,
  preferences: m.preferences || [],
  allergies: m.allergies || [],
  excludedIngredients: m.excludedIngredients || [],
  diets: (m.preferences || []).map((p) => PREF_DIET[p]).filter(Boolean),
  impliedAllergies: (m.preferences || []).map((p) => PREF_ALLERGEN[p]).filter(Boolean),
});

// Union rule (REQ-SAFE-05): a shared meal must be safe for EVERY person eating it. Returns an
// onboarding-shaped profile so safety_filter.service.js stays the only place that builds filters.
const unionProfile = (people, cookingTime) => ({
  allergies: uniq(people.flatMap((p) => [...p.allergies, ...(p.impliedAllergies || [])])),
  specificIngredients: uniq(people.flatMap((p) => p.excludedIngredients)),
  dietaryRestrictions: uniq(people.flatMap((p) => p.diets)),
  cookingTime,
});

// Plans are shared meals: once the owner has household members, every safety rule is the union of
// everyone (REQ-SAFE-05). No members = the owner's onboarding untouched. shortcut: no "plan for just me"
// toggle (spec REQ-PRO-06), so adding a member always widens the exclusions; upgrade with a user setting.
const householdProfile = (onboarding, members) => {
  if (!members.length) return onboarding;
  const owner = ownerPerson({ firstName: '', lastName: '', onboarding });
  const union = unionProfile([owner, ...members.map(memberPerson)], onboarding.cookingTime);
  return { ...onboarding, ...union, hasNoRestrictions: false };
};

const planProfile = async (userId, onboarding) => {
  const user = await User.findById(userId).select('planForHousehold').lean().exec();
  if (user?.planForHousehold === false) return onboarding;
  return householdProfile(onboarding, await HouseholdMember.find({ userId }).lean().exec());
};

const setPlanMode = async (userId, planForHousehold) => {
  await User.updateOne({ _id: userId }, { $set: { planForHousehold } }).exec();
  return { planForHousehold };
};

const loadPeople = async (userId) => {
  const [user, members] = await Promise.all([
    User.findById(userId).select('firstName lastName onboarding favoriteRecipes planForHousehold').lean().exec(),
    HouseholdMember.find({ userId }).sort({ createdAt: 1 }).lean().exec(),
  ]);
  if (!user) throw httpError('User not found', 404);
  return { user, people: [ownerPerson(user), ...members.map(memberPerson)] };
};

const strip = ({ diets, impliedAllergies, ...person }) => person;

const listHousehold = async (userId) => {
  const { user, people } = await loadPeople(userId);
  const planForHousehold = user.planForHousehold !== false;
  const children = people.filter((p) => p.role === 'child').length;
  return {
    members: people.map(strip),
    totals: { total: people.length, adults: people.length - children, children },
    planForHousehold,
    // Σ portion factors: the default servings for a meal (REQ-PLAN-06); just the owner when planning for one
    portions: (planForHousehold ? people : people.slice(0, 1)).reduce((sum, p) => sum + p.portionFactor, 0),
  };
};

const createMember = async (userId, data) => {
  if ((await HouseholdMember.countDocuments({ userId })) >= MAX_MEMBERS) {
    throw httpError(`You can add up to ${MAX_MEMBERS} household members.`, 400);
  }
  const member = await HouseholdMember.create({ ...data, userId });
  return strip(memberPerson(member.toObject()));
};

const updateMember = async (userId, id, data) => {
  const member = await HouseholdMember.findOneAndUpdate({ _id: id, userId }, { $set: data }, { new: true }).lean().exec();
  if (!member) throw httpError('Household member not found', 404);
  return strip(memberPerson(member));
};

const deleteMember = async (userId, id) => {
  const gone = await HouseholdMember.findOneAndDelete({ _id: id, userId }).lean().exec();
  if (!gone) throw httpError('Household member not found', 404);
  return { success: true };
};

module.exports = { listHousehold, createMember, updateMember, deleteMember, loadPeople, unionProfile, householdProfile, planProfile, setPlanMode };
