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
  };

  afterEach(() => {
    config.nodeEnv = originalNodeEnv;
    if (originalProcessEnv.nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalProcessEnv.nodeEnv;
    if (originalProcessEnv.msg91AuthKey === undefined) delete process.env.MSG91_AUTH_KEY;
    else process.env.MSG91_AUTH_KEY = originalProcessEnv.msg91AuthKey;
  });

  test('uses the fixed OTP in development without an MSG91 key', async () => {
    process.env.NODE_ENV = 'development';
    process.env.MSG91_AUTH_KEY = '';

    let msg91;
    jest.isolateModules(() => {
      msg91 = jest.requireActual('../../src/modules/auth/msg91.service');
    });

    await expect(msg91.sendOtp('+919900009988')).resolves.toMatchObject({ success: true });
    await expect(msg91.verifyOtp('+919900009988', '123456')).resolves.toMatchObject({ success: true });
    await expect(msg91.verifyOtp('+919900009988', '000000')).resolves.toMatchObject({ success: false });
  });

  test('does not enable the fixed OTP fallback in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.MSG91_AUTH_KEY = '';

    let msg91;
    jest.isolateModules(() => {
      msg91 = jest.requireActual('../../src/modules/auth/msg91.service');
    });

    expect(msg91.isDemoMode).toBe(false);
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
