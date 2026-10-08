// Unit test for notification.sendEmail Brevo integration — verifies the
// graceful stub fallback (no BREVO_API_KEY) and the real-path request shape
// (with key) using a mocked global fetch. DB-free: prisma is mocked.

jest.mock('../../src/shared/database', () => ({ prisma: {} }));

const notificationService = require('../../src/modules/notifications/notification.service');

describe('notification.sendEmail (Brevo)', () => {
  const origKey = process.env.BREVO_API_KEY;
  afterEach(() => {
    process.env.BREVO_API_KEY = origKey;
    jest.restoreAllMocks();
  });

  it('falls back to a stub (no network) when BREVO_API_KEY is unset', async () => {
    delete process.env.BREVO_API_KEY;
    const fetchSpy = jest.spyOn(global, 'fetch');
    const result = await notificationService.sendEmail('a@b.com', 'Hi', 'welcome', {});
    expect(result).toEqual({ success: true, stubbed: true });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('POSTs to Brevo with the api-key header when configured', async () => {
    process.env.BREVO_API_KEY = 'test-key';
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, json: async () => ({}) });

    const result = await notificationService.sendEmail('a@b.com', 'Hi', 'welcome', { x: 1 });

    expect(result).toEqual({ success: true });
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.brevo.com/v3/smtp/email',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'api-key': 'test-key' }),
      }),
    );
  });

  it('returns failure (for BullMQ retry) when Brevo responds non-ok', async () => {
    process.env.BREVO_API_KEY = 'test-key';
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: false, status: 500, text: async () => 'err' });
    const result = await notificationService.sendEmail('a@b.com', 'Hi', 'welcome', {});
    expect(result.success).toBe(false);
    expect(result.status).toBe(500);
  });
});
