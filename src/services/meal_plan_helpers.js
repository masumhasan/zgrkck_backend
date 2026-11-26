const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const DAY_NAMES = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday',
  'Thursday', 'Friday', 'Saturday',
];

const MEAL_ORDER = {
  BREAKFAST: 1,
  LUNCH: 2,
  SNACK: 3,
  DINNER: 4,
};

function toDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Totals the app shows (ring, day card): counts Complete and Estimated recipes and custom entries,
// leaves out 'none' ones and lists them so the app can say they are not counted.
function dayNutrition(meals = []) {
  const zero = () => ({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  const planned = zero();
  const cooked = zero();
  const excluded = [];
  let estimated = false;
  for (const m of meals) {
    if (m.nutritionStatus === 'none') {
      excluded.push({ mealType: m.mealType, name: m.name });
      continue;
    }
    if (m.nutritionStatus === 'estimated') estimated = true;
    for (const [k, v] of [['kcal', m.kcal], ['proteinG', m.proteinG], ['carbsG', m.carbsG], ['fatG', m.fatG]]) {
      planned[k] += v || 0;
      if (m.status === 'cooked') cooked[k] += v || 0;
    }
  }
  return { planned, cooked, estimated, excluded };
}

const NON_MAIN_COURSES = new Set(['side', 'sauce', 'condiment', 'dip', 'dressing']);
const isMainDish = (r) => !(r.meta?.courses || []).some((c) => NON_MAIN_COURSES.has(String(c).toLowerCase()));

function buildPools(safeCandidates) {
  const bPool = safeCandidates.filter((r) => r.meta?.mealTypes?.includes('breakfast') || r.meta?.tags?.includes('breakfast'));
  const lRaw = safeCandidates.filter((r) => r.meta?.mealTypes?.includes('lunch') || r.meta?.mealTypes?.includes('dinner'));
  const dRaw = safeCandidates.filter((r) => r.meta?.mealTypes?.includes('dinner') || r.meta?.mealTypes?.includes('lunch'));
  const lPool = lRaw.filter(isMainDish);
  const dPool = dRaw.filter(isMainDish);
  const sPool = safeCandidates.filter((r) => r.meta?.mealTypes?.includes('snack') || r.meta?.tags?.includes('snack') || r.meta?.courses?.includes('side') || r.meta?.courses?.includes('dessert'));

  return {
    BREAKFAST: bPool.length > 0 ? bPool : safeCandidates,
    LUNCH: lPool.length > 0 ? lPool : (lRaw.length > 0 ? lRaw : safeCandidates),
    SNACK: sPool.length > 0 ? sPool : safeCandidates,
    DINNER: dPool.length > 0 ? dPool : (dRaw.length > 0 ? dRaw : safeCandidates),
  };
}

module.exports = {
  MONTH_NAMES,
  DAY_NAMES,
  MEAL_ORDER,
  toDateString,
  dayNutrition,
  buildPools,
};
