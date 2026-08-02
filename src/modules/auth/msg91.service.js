const axios = require('axios');
const config = require('../../shared/config');

const MSG91_BASE = 'https://control.msg91.com/api/v5';

/**
 * Send OTP to a phone number via MSG91
 * @param {string} phone - Phone number with country code (e.g., 919876543210)
 */
const sendOtp = async (phone) => {
  // Strip + and spaces
  const mobile = phone.replace(/[+\s]/g, '');

  try {
    const response = await axios.post(`${MSG91_BASE}/otp`, null, {
      params: {
        template_id: config.msg91.otpTemplateId || '',
        mobile,
        authkey: config.msg91.authKey,
        otp_length: 6,
      },
    });

    return { success: true, type: response.data?.type, message: response.data?.message };
  } catch (error) {
    console.error('[MSG91] Send OTP error:', error.response?.data || error.message);
    return { success: false, message: error.response?.data?.message || 'Failed to send OTP' };
  }
};

/**
 * Verify OTP
 * @param {string} phone - Phone number with country code
 * @param {string} otp - 6-digit OTP
 */
const verifyOtp = async (phone, otp) => {
  const mobile = phone.replace(/[+\s]/g, '');

  try {
    const response = await axios.get(`${MSG91_BASE}/otp/verify`, {
      params: {
        mobile,
        otp,
        authkey: config.msg91.authKey,
      },
    });

    return { success: response.data?.type === 'success', message: response.data?.message };
  } catch (error) {
    console.error('[MSG91] Verify OTP error:', error.response?.data || error.message);
    return { success: false, message: error.response?.data?.message || 'OTP verification failed' };
  }
};

/**
 * Send transactional SMS
 * @param {string} phone - Phone with country code
 * @param {string} message - SMS body
 */
const sendSms = async (phone, message) => {
  const mobile = phone.replace(/[+\s]/g, '');

  try {
    const response = await axios.post(`${MSG91_BASE}/flow/`, {
      sender: config.msg91.senderId,
      route: '4', // Transactional
      country: '91',
      sms: [{ message, to: [mobile] }],
    }, {
      headers: { authkey: config.msg91.authKey, 'Content-Type': 'application/json' },
    });

    return { success: true, data: response.data };
  } catch (error) {
    console.error('[MSG91] Send SMS error:', error.response?.data || error.message);
    return { success: false, message: 'SMS sending failed' };
  }
};

module.exports = { sendOtp, verifyOtp, sendSms };
