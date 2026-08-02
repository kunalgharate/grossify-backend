const subscriptionService = require('./subscription.service');

const getPlans = async (req, res) => {
  const { categoryType } = req.query;
  const plans = await subscriptionService.getPlans(categoryType);
  res.status(200).json({ plans });
};

const subscribe = async (req, res) => {
  const subscription = await subscriptionService.subscribe(req.user.id, req.body);
  res.status(201).json({ subscription, message: 'Subscription created (14-day trial)' });
};

const getCurrent = async (req, res) => {
  const subscription = await subscriptionService.getCurrent(req.user.id);
  res.status(200).json({ subscription });
};

module.exports = { getPlans, subscribe, getCurrent };
