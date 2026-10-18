jest.mock('../../src/modules/auth/auth.controller', () => {
  const ok = (req, res) => res.status(200).json({ message: 'ok' });
  return {
    register: ok,
    login: ok,
    sendOtp: ok,
    verifyOtp: ok,
    verifyWidgetToken: ok,
    refreshToken: ok,
    logout: ok,
    me: ok,
  };
});

jest.mock('../../src/modules/auth/msg91.service', () => ({
  isDemoMode: true,
}));

jest.mock('../../src/shared/middleware/auth', () => ({
  authenticate: (req, res, next) => next(),
}));

const express = require('express');
const request = require('supertest');
const config = require('../../src/shared/config');
const authRoutes = require('../../src/modules/auth/auth.routes');

const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.use('/api/v1/auth', authRoutes);

const sendOtpRequest = (phone, ip) => request(app)
  .post('/api/v1/auth/send-otp')
  .set('X-Forwarded-For', ip)
  .send({ phone });

const verifyOtpRequest = (phone, ip) => request(app)
  .post('/api/v1/auth/verify-otp')
  .set('X-Forwarded-For', ip)
  .send({ phone, otp: '123456' });

describe('OTP rate limiting', () => {
  const originalNodeEnv = config.nodeEnv;
  const originalProcessEnv = {
    nodeEnv: process.env.NODE_ENV,
    msg91AuthKey: process.env.MSG91_AUTH_KEY,
    demoOtpEnabled: process.env.DEMO_OTP_ENABLED,
    demoOtpAllowedPhones: process.env.DEMO_OTP_ALLOWED_PHONES,
  };

  afterEach(() => {
    config.nodeEnv = originalNodeEnv;
    if (originalProcessEnv.nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalProcessEnv.nodeEnv;
    if (originalProcessEnv.msg91AuthKey === undefined) delete process.env.MSG91_AUTH_KEY;
    else process.env.MSG91_AUTH_KEY = originalProcessEnv.msg91AuthKey;
    if (originalProcessEnv.demoOtpEnabled === undefined) delete process.env.DEMO_OTP_ENABLED;
    else process.env.DEMO_OTP_ENABLED = originalProcessEnv.demoOtpEnabled;
    if (originalProcessEnv.demoOtpAllowedPhones === undefined) delete process.env.DEMO_OTP_ALLOWED_PHONES;
    else process.env.DEMO_OTP_ALLOWED_PHONES = originalProcessEnv.demoOtpAllowedPhones;
  });

  test('uses the fixed OTP only for allowlisted demo phones in development', async () => {
    process.env.NODE_ENV = 'development';
    process.env.MSG91_AUTH_KEY = '';
    process.env.DEMO_OTP_ALLOWED_PHONES = '+919000000001,+919000000002,+919000000004,+919000000005';

    let msg91;
    jest.isolateModules(() => {
      msg91 = jest.requireActual('../../src/modules/auth/msg91.service');
    });

    for (const phone of [
      '+919000000001',
      '+919000000002',
      '+919000000004',
      '+919000000005',
    ]) {
      await expect(msg91.sendOtp(phone)).resolves.toMatchObject({ success: true });
      await expect(msg91.verifyOtp(phone, '123456')).resolves.toMatchObject({ success: true });
    }
    await expect(msg91.sendOtp('9000000001')).resolves.toMatchObject({ success: true });
    await expect(msg91.verifyOtp('+919000000001', '000000')).resolves.toMatchObject({ success: false });
    await expect(msg91.sendOtp('+919000000011')).resolves.toMatchObject({
      success: false,
      message: 'Demo OTP is not enabled for this phone number',
    });
    await expect(msg91.verifyOtp('+919000000011', '123456')).resolves.toMatchObject({ success: false });
  });

  test('does not enable the fixed OTP fallback in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.MSG91_AUTH_KEY = '';
    process.env.DEMO_OTP_ENABLED = 'false';
    process.env.DEMO_OTP_ALLOWED_PHONES = '';

    let msg91;
    jest.isolateModules(() => {
      msg91 = jest.requireActual('../../src/modules/auth/msg91.service');
    });

    expect(msg91.isDemoMode).toBe(false);
  });

  test('allows fixed OTP in production only for explicitly enabled demo accounts', async () => {
    process.env.NODE_ENV = 'production';
    process.env.MSG91_AUTH_KEY = '';
    process.env.DEMO_OTP_ENABLED = 'true';
    process.env.DEMO_OTP_ALLOWED_PHONES = '+919000000001,+919000000002,+919000000004,+919000000005';

    let msg91;
    jest.isolateModules(() => {
      msg91 = jest.requireActual('../../src/modules/auth/msg91.service');
    });

    expect(msg91.isDemoMode).toBe(false);
    for (const phone of [
      '+919000000001',
      '+919000000002',
      '+919000000004',
      '+919000000005',
    ]) {
      await expect(msg91.sendOtp(phone)).resolves.toMatchObject({ success: true });
      await expect(msg91.verifyOtp(phone, '123456')).resolves.toMatchObject({ success: true });
    }
    await expect(msg91.sendOtp('+919000000011')).resolves.toMatchObject({
      success: false,
      message: 'Demo OTP is not enabled for this phone number',
    });
    await expect(msg91.verifyOtp('+919000000011', '123456')).resolves.toMatchObject({ success: false });
  });

  test('requires an allowlist when production demo OTP is enabled', () => {
    process.env.NODE_ENV = 'production';
    process.env.DEMO_OTP_ENABLED = 'true';
    process.env.DEMO_OTP_ALLOWED_PHONES = '';

    expect(() => {
      jest.isolateModules(() => {
        jest.requireActual('../../src/shared/config');
      });
    }).toThrow('DEMO_OTP_ALLOWED_PHONES must contain at least one phone');
  });

  test('does not rate-limit fixed demo OTP requests in development', async () => {
    config.nodeEnv = 'development';

    for (let attempt = 0; attempt < 7; attempt += 1) {
      const response = await sendOtpRequest('+919900009988', '198.51.100.1');
      expect(response.status).toBe(200);
    }
  });

  test('limits OTP sends per phone and returns a useful cooldown', async () => {
    config.nodeEnv = 'production';

    const responses = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const phone = attempt % 2 === 0 ? '+919900009977' : '9900009977';
      responses.push(await sendOtpRequest(phone, '198.51.100.2'));
    }

    expect(responses.slice(0, 5).every((response) => response.status === 200)).toBe(true);
    expect(responses[5].status).toBe(429);
    expect(responses[5].body).toMatchObject({
      error: 'TOO_MANY_REQUESTS',
      message: expect.stringContaining('Try again in about'),
    });
    expect(responses[5].body.retryAfterSeconds).toBeGreaterThan(0);
    expect(Number(responses[5].headers['retry-after'])).toBeGreaterThan(0);
  });

  test('keeps verification attempts separate from SMS-send limits', async () => {
    config.nodeEnv = 'production';
    const ip = '198.51.100.3';

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await sendOtpRequest('+919900009966', ip)).status).toBe(200);
    }

    expect((await verifyOtpRequest('+919900009966', ip)).status).toBe(200);
  });

  test('allows a shared IP a broader send budget while limiting each phone', async () => {
    config.nodeEnv = 'production';
    const ip = '198.51.100.4';

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const phone = `+9199${String(attempt).padStart(8, '0')}`;
      expect((await sendOtpRequest(phone, ip)).status).toBe(200);
    }

    const blocked = await sendOtpRequest('+919900000099', ip);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe('TOO_MANY_REQUESTS');
  });
});
