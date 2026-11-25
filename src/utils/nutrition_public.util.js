// The nutrition shape the app sees: { status, perServing } and nothing internal. A recipe that was never
// calculated (or whose calculation failed the 20% rule) is simply 'none' - the app shows "not available".
function publicNutrition(n) {
  if (!n || !n.status || n.status === 'none' || !n.perServing || n.perServing.kcal == null) return { status: 'none', perServing: null };
  const { kcal, protein, carbs, fat, fibre, sugar, sodium } = n.perServing;
  return { status: n.status, perServing: { kcal, protein, carbs, fat, fibre, sugar, sodium } };
}

const withNutrition = (doc) => (doc ? { ...doc, nutrition: publicNutrition(doc.nutrition) } : doc);

module.exports = { publicNutrition, withNutrition };
