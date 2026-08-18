const authService = require('./auth.service');

const register = async (req, res) => {
  const { name, email, phone, password } = req.body;
  const result = await authService.register({ name, email, phone, password });
  res.status(201).json(result);
};

const login = async (req, res) => {
  const { identifier, password } = req.body;
  const result = await authService.login({ identifier, password });
  res.status(200).json(result);
};

const sendOtp = async (req, res) => {
  const { phone } = req.body;
  const result = await authService.sendOtp(phone);
  res.status(200).json(result);
};

const verifyOtp = async (req, res) => {
  const { phone, otp } = req.body;
  const result = await authService.verifyOtp(phone, otp);
  res.status(200).json(result);
};

const verifyWidgetToken = async (req, res) => {
  const { accessToken } = req.body;
  const result = await authService.verifyWidgetToken(accessToken);
  res.status(200).json(result);
};

const refreshToken = async (req, res) => {
  const { refreshToken } = req.body;
  const result = await authService.refreshToken(refreshToken);
  res.status(200).json(result);
};

const logout = async (req, res) => {
  await authService.logout();
  res.status(200).json({ message: 'Logged out successfully' });
};

module.exports = { register, login, sendOtp, verifyOtp, verifyWidgetToken, refreshToken, logout };
