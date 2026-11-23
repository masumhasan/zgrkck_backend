// Pure wording for each notification type. Every number and name comes from the user's own data.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// local 'YYYY-MM-DD'
const dateKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const shortDate = (key) => {
  const [, m, d] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}`;
};

// "Spinach", "Spinach and Milk", "Spinach, Milk, Eggs and 2 more"
const nameList = (names, max = 3) => {
  if (names.length <= 1) return names.join('');
  if (names.length <= max) return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${names.slice(0, max).join(', ')} and ${names.length - max} more`;
};

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function planReady(plan) {
  const meals = (plan.days || []).reduce((n, d) => n + (d.meals?.length || 0), 0);
  return {
    type: 'plan_ready',
    title: 'Your meal plan is ready',
    body: `${plural(meals, 'meal')} planned for ${shortDate(plan.startDate)} – ${shortDate(plan.endDate)}.`,
    action: 'plan',
  };
}

// items: [{ name, useBy: 'YYYY-MM-DD' }]
function useItUp(items, today) {
  const soonest = items.map((i) => i.useBy).sort()[0];
  const when = soonest === today ? 'today' : soonest === dateKey(addDays(new Date(`${today}T00:00:00`), 1)) ? 'tomorrow' : `by ${shortDate(soonest)}`;
  const names = nameList(items.map((i) => i.name));
  return {
    type: 'use_it_up',
    title: 'Use it up soon',
    body: `${names} ${items.length === 1 ? 'needs' : 'need'} using ${when}.`,
    action: 'pantry',
  };
}

function shoppingReminder(count) {
  return {
    type: 'shopping_reminder',
    title: 'Shopping list',
    body: `${plural(count, 'item')} still on your list for this week's meals.`,
    action: 'shopping',
  };
}

function weeklyReport({ cooked, planned, weekStart }) {
  return {
    type: 'weekly_report',
    title: `Your week of ${shortDate(weekStart)}`,
    body: planned > 0 ? `You cooked ${cooked} of ${plural(planned, 'planned meal')}.` : `You cooked ${plural(cooked, 'meal')}.`,
    action: 'progress',
  };
}

function planConflict(mealNames) {
  return {
    type: 'plan_conflict',
    title: 'Check your plan',
    body: `${nameList(mealNames)} no longer ${mealNames.length === 1 ? 'fits' : 'fit'} your profile. Replace ${mealNames.length === 1 ? 'it' : 'them'} in the Plan tab.`,
    action: 'plan',
  };
}

module.exports = { dateKey, addDays, nameList, planReady, useItUp, shoppingReminder, weeklyReport, planConflict };
