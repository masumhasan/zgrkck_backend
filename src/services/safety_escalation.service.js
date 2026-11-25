const { SafetyEvent, SAFETY_KINDS } = require('../models/safety_event.model');

// REQ-SAFE-09..12: free text that asks for extreme restriction or shows disordered-eating signals gets a
// supportive message instead of a plan or recipes. Pure code, no AI. Deliberately narrow (it only reacts to
// clear signals) and it never diagnoses, comments on a body, or gives numbers.
// shortcut: English keyword rules, no per-country helpline list; upgrade with locale-specific resources.
const CALORIE_FLOOR = 1200; // the lowest daily floor we plan at (nutrition_target.service.js)
const SIGNALS = [
  /\b(starv(e|ing)|self[- ]?starv\w*|pro[- ]?ana|thinspo|purg(e|ing)|laxatives?)\b/i,
  /\bmake myself (throw up|sick|vomit)\b/i,
  /\b(water|dry) fast(ing)?\b|\bfast(ing)? for \d+ days?\b|\bno food for \d+ days?\b/i,
  /\b(zero|0|no) (calories|kcal)\b/i,
  /\blose \d+\s*(kg|kgs|kilos?|lbs?|pounds?)\s*(in|within)\s*(a|1|one|2|two|3|three|\d+)\s*(day|days|week|weeks)\b/i,
];
const LOW_CALORIES = /\b(\d{3,4})\s*(calories|kcal|cals?)\b/gi;
const DAILY = /\b(a day|per day|daily|each day|\/\s*day|a day)\b/i;

const MESSAGE =
  "We can't plan or search around that. Eating very little can be harmful, and what you're describing sounds hard. " +
  'If food or how you feel about your body is weighing on you, please talk to a doctor, a dietitian or an ' +
  'eating-disorder support service in your country. When you are ready, Mealist can build balanced meals at a healthy level for you.';

const flagged = (text) => {
  const t = String(text || '');
  if (SIGNALS.some((rx) => rx.test(t))) return true;
  // "500 calories a day": a daily amount below the floor
  for (const m of t.matchAll(LOW_CALORIES)) {
    const around = t.slice(Math.max(0, m.index - 20), m.index + m[0].length + 20);
    if (Number(m[1]) < CALORIE_FLOOR && DAILY.test(around)) return true;
  }
  return false;
};

// best-effort like activity logging: a failed counter must never break the request
const record = async (userId, kind) => {
  if (!userId || !SAFETY_KINDS.includes(kind)) return;
  try {
    await SafetyEvent.create({ userId, kind });
  } catch (err) {
    console.error('Failed to record safety event:', err.message);
  }
};

// text -> null when fine, otherwise { message }; logs the event for the monthly report
const screen = async (userId, text) => {
  if (!flagged(text)) return null;
  await record(userId, 'escalation');
  return { message: MESSAGE };
};

// zeros included: "report even when zero" (REQ-SAFE-13)
const counts = async (days = 30) => {
  const since = new Date(Date.now() - days * 86400000);
  const rows = await SafetyEvent.aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: '$kind', n: { $sum: 1 } } }]);
  const out = { days };
  for (const k of SAFETY_KINDS) out[k] = rows.find((r) => r._id === k)?.n || 0;
  return out;
};

module.exports = { flagged, screen, record, counts, MESSAGE };
