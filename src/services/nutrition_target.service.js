const https = require('https');
const { config } = require('../config/env');
const userRepository = require('../repositories/user.repository');

class NutritionTargetService {
  /**
   * Deterministic Harris-Benedict & goal-adjusted macro calculator.
   * Serves as reliable baseline and fallback for AI calculation.
   */
  calculateBaselineTarget(user) {
    const pInfo = user.personalInfo || {};
    const onboarding = user.onboarding || {};
    const goal = (onboarding.goal || '').toLowerCase();
    const focuses = (onboarding.nutritionFocuses || []).map((f) => f.toLowerCase());
    const gender = (pInfo.gender || 'male').toLowerCase();

    let weightKg = pInfo.weight || 70;
    if (pInfo.weightUnit === 'lbs') weightKg = weightKg * 0.453592;

    let heightCm = pInfo.height || 175;
    if (pInfo.heightUnit === 'ft') heightCm = heightCm * 30.48;

    const age = pInfo.age || 28;

    // Basal Metabolic Rate (BMR) - Mifflin-St Jeor equation
    let bmr;
    if (gender.includes('female') || gender.includes('woman')) {
      bmr = 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
    } else {
      bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
    }

    // Activity multiplier estimate (moderately active standard: ~1.4)
    let tdee = Math.round(bmr * 1.4);

    // Goal adjustments
    if (goal.includes('lose weight') || goal.includes('reduce')) {
      tdee -= 400; // Deficit
    } else if (goal.includes('build muscle') || goal.includes('gain')) {
      tdee += 300; // Surplus
    }

    // Floor calories at safe minimums
    tdee = Math.max(1300, Math.min(3800, Math.round(tdee / 50) * 50));

    // Protein calculation based on goal and focuses
    let proteinGramsPerKg = 1.6;
    if (goal.includes('build muscle') || focuses.some((f) => f.includes('protein'))) {
      proteinGramsPerKg = 2.0;
    } else if (goal.includes('lose weight')) {
      proteinGramsPerKg = 1.8;
    }
    let protein = Math.round(weightKg * proteinGramsPerKg);
    protein = Math.max(70, Math.min(240, protein));

    // Fat calculation (approx 25-30% of total calories)
    let fatRatio = 0.28;
    if (focuses.some((f) => f.includes('low carb') || f.includes('keto'))) {
      fatRatio = 0.38;
    }
    let fat = Math.round((tdee * fatRatio) / 9);

    // Carbs from remaining calories (4 kcal per g carb & protein, 9 per g fat)
    const carbCalories = tdee - (protein * 4 + fat * 9);
    let carbs = Math.max(50, Math.round(carbCalories / 4));

    // Consumed values for today's representation
    const caloriesConsumed = Math.round(tdee * 0.72);
    const proteinConsumed = Math.round(protein * 0.71);
    const carbsConsumed = Math.round(carbs * 0.69);
    const fatConsumed = Math.round(fat * 0.74);

    return {
      calories: tdee,
      protein,
      carbs,
      fat,
      caloriesConsumed,
      proteinConsumed,
      carbsConsumed,
      fatConsumed,
      lastCalculatedAt: new Date(),
    };
  }

  async calculateAITarget(user) {
    const baseline = this.calculateBaselineTarget(user);

    if (!config.openaiApiKey || config.openaiApiKey.includes('PLACEHOLDER')) {
      return baseline;
    }

    const pInfo = user.personalInfo || {};
    const onboarding = user.onboarding || {};

    const prompt = `You are an expert sports and clinical nutritionist for Mealist.ai.
Compute the recommended daily caloric and macronutrient targets for this user based on their data:
- Name: ${user.firstName || 'User'}
- Gender: ${pInfo.gender || 'Not specified'}
- Age: ${pInfo.age || 28}
- Height: ${pInfo.height || 175} ${pInfo.heightUnit || 'cm'}
- Weight: ${pInfo.weight || 70} ${pInfo.weightUnit || 'kg'}
- Primary Goal: ${onboarding.goal || 'Eat healthier'}
- Dietary Preference: ${onboarding.dietaryPreference || 'No preference'}
- Nutrition Focuses: ${(onboarding.nutritionFocuses || []).join(', ') || 'Balanced'}

Baseline guideline: ${baseline.calories} kcal, ${baseline.protein}g protein, ${baseline.carbs}g carbs, ${baseline.fat}g fat.

Respond with ONLY valid JSON:
{
  "calories": <integer, total daily calories>,
  "protein": <integer, grams of protein>,
  "carbs": <integer, grams of carbohydrates>,
  "fat": <integer, grams of fat>
}`;

    try {
      const responseText = await this._callOpenAI(prompt);
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.calories && parsed.protein && parsed.carbs && parsed.fat) {
          const cal = parseInt(parsed.calories, 10);
          return {
            calories: cal,
            protein: parseInt(parsed.protein, 10),
            carbs: parseInt(parsed.carbs, 10),
            fat: parseInt(parsed.fat, 10),
            caloriesConsumed: Math.round(cal * 0.72),
            proteinConsumed: Math.round(parseInt(parsed.protein, 10) * 0.71),
            carbsConsumed: Math.round(parseInt(parsed.carbs, 10) * 0.69),
            fatConsumed: Math.round(parseInt(parsed.fat, 10) * 0.74),
            lastCalculatedAt: new Date(),
          };
        }
      }
    } catch (e) {
      console.warn('AI target generation failed; using baseline calculation:', e.message);
    }

    return baseline;
  }

  async regenerateUserTarget(userId) {
    const user = await userRepository.findById(userId);
    if (!user) {
      const err = new Error('User not found');
      err.statusCode = 404;
      throw err;
    }

    const newTarget = await this.calculateAITarget(user);
    const updatedUser = await userRepository.updateNutritionTarget(userId, newTarget);
    return updatedUser.nutritionTarget;
  }

  _callOpenAI(prompt) {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      });

      const options = {
        hostname: 'api.openai.com',
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.openaiApiKey}`,
        },
        timeout: 12000,
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const data = JSON.parse(body);
              resolve(data.choices[0].message.content);
            } catch (err) {
              reject(err);
            }
          } else {
            reject(new Error(`OpenAI HTTP ${res.statusCode}: ${body}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('OpenAI API request timed out'));
      });

      req.write(payload);
      req.end();
    });
  }
}

module.exports = new NutritionTargetService();

