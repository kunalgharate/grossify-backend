const axios = require('axios');
const config = require('../../shared/config');

const MSG91_BASE = 'https://control.msg91.com/api/v5';

// Demo mode: when MSG91_AUTH_KEY is not set or is 'xxx' or 'demo'
const isDemoMode = !config.msg91.authKey || config.msg91.authKey === 'xxx' || config.msg91.authKey === 'demo';
const DEMO_OTP = '123456'; // Fixed OTP for demo/development

if (isDemoMode) {
  console.warn('[MSG91] ⚠️  Running in DEMO mode — OTP is always 123456, no real SMS sent');
}

/**
 * Send OTP to a phone number via MSG91
 * @param {string} phone - Phone number with country code (e.g., 919876543210)
 */
const sendOtp = async (phone) => {
  // Strip + and spaces
  const mobile = phone.replace(/[+\s]/g, '');

  // Demo mode — skip actual API call
  if (isDemoMode) {
    console.log(`[MSG91 DEMO] OTP for ${mobile}: ${DEMO_OTP}`);
    return { success: true, type: 'success', message: 'OTP sent (demo mode)' };
  }

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
  const otpStr = String(otp); // Ensure OTP is always compared as string

  // Demo mode — accept fixed OTP
  if (isDemoMode) {
    if (otpStr === DEMO_OTP) {
      return { success: true, message: 'OTP verified (demo mode)' };
    }
    return { success: false, message: 'Invalid OTP (demo mode — use 123456)' };
  }

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

/**
 * Verify MSG91 Widget access token (for OTP Widget frontend flow)
 * @param {string} accessToken - JWT token received from MSG91 OTP widget
 * @returns {object} { success, message, phone }
 */
const verifyWidgetToken = async (accessToken) => {
  // Demo mode — accept any token, return a dummy phone
  if (isDemoMode) {
    console.log('[MSG91 DEMO] Widget token accepted (demo mode)');
    return { success: true, message: 'Token verified (demo mode)', phone: '919876543210' };
  }

  try {
    const response = await axios.post(`${MSG91_BASE}/widget/verifyAccessToken`, {
      authkey: config.msg91.authKey,
      'access-token': accessToken,
    }, {
      headers: { 'Content-Type': 'application/json' },
    });

    if (response.data?.type === 'success') {
      return {
        success: true,
        message: response.data.message,
        phone: response.data.phone || response.data.mobile,
      };
    }

    return { success: false, message: response.data?.message || 'Token verification failed' };
  } catch (error) {
    console.error('[MSG91] Widget token verify error:', error.response?.data || error.message);
    return { success: false, message: error.response?.data?.message || 'Widget token verification failed' };
  }
};

module.exports = { sendOtp, verifyOtp, sendSms, verifyWidgetToken };
