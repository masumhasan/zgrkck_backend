const { User } = require('../models/user.model');
const { Recipe } = require('../models/recipe.model');
const { MealPlan } = require('../models/plan.model');
const { PantryItem } = require('../models/pantry.model');
const { ShoppingItem } = require('../models/shopping.model');
const { CookLog } = require('../models/cook_log.model');
const { HouseholdMember } = require('../models/household_member.model');
const { Notification } = require('../models/notification.model');
const { sendDataExportEmail } = require('../config/mailer');

const httpError = (message, statusCode) => Object.assign(new Error(message), { statusCode });
const find = (Model, filter) => Model.find(filter).select('-__v').lean().exec();

// "Export my data": everything we hold for this account, as one JSON file emailed to the account's own address
// (never returned to the caller, so a stolen session cannot read it without the mailbox). The password hash is never selected.
class DataExportService {
  async build(userId) {
    const user = await User.findById(userId).select('-__v -forYouCache').lean().exec();
    if (!user) throw httpError('User not found', 404);
    const [recipes, plans, pantry, shopping, cooked, household, notifications] = await Promise.all([
      find(Recipe, { createdBy: userId }),
      find(MealPlan, { userId }),
      find(PantryItem, { userId }),
      find(ShoppingItem, { userId }),
      find(CookLog, { userId }),
      find(HouseholdMember, { userId }),
      find(Notification, { userId }),
    ]);
    return { exportedAt: new Date().toISOString(), account: user, recipes, plans, pantry, shopping, cooked, household, notifications };
  }

  async emailExport(userId) {
    const data = await this.build(userId);
    if (!(await sendDataExportEmail(data.account.email, JSON.stringify(data, null, 2)))) {
      throw httpError('We could not send the email right now. Please try again later.', 502);
    }
    return { email: data.account.email };
  }
}

module.exports = new DataExportService();
