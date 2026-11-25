// Same ingredient = same words once descriptors are dropped and plurals folded: pantry "onion" covers
// "red onion" and "onions", but "egg" does NOT cover "egg plants" or "egg yolk". Substring matching
// told people they owned things they did not. shortcut: "chicken" is not covered by "chicken breast"
// (a false "missing" is harmless, a false "in pantry" is not); upgrade with an ingredient alias table.
const DESCRIPTORS = new Set(('fresh large small medium big whole chopped sliced diced minced grated ground ' +
  'crushed peeled boneless skinless ripe raw dried frozen canned tinned extra virgin').split(' '));
const singular = (w) => {
  if (w.length <= 3 || w.endsWith('ss')) return w;
  if (w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (/(oes|ches|shes|xes)$/.test(w)) return w.slice(0, -2);
  return w.endsWith('s') ? w.slice(0, -1) : w;
};
const ingredientKey = (name) => String(name).toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/)
  .filter((w) => w && !DESCRIPTORS.has(w)).map(singular).sort().join(' ');
const makeCovers = (pantryNames) => {
  const have = new Set(pantryNames.map(ingredientKey).filter(Boolean));
  return (ingredient) => have.has(ingredientKey(ingredient));
};

module.exports = { ingredientKey, makeCovers };
