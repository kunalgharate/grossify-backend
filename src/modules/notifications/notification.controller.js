const notificationService = require('./notification.service');

const list = async (req, res) => {
  const { page, limit } = req.query;
  const result = await notificationService.list(req.user.id, { page, limit });
  res.status(200).json(result);
};

const markRead = async (req, res) => {
  await notificationService.markRead(req.user.id, req.params.id);
  res.status(200).json({ message: 'Notification marked as read' });
};

module.exports = { list, markRead };
