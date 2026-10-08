jest.mock('../../src/shared/database', () => ({
  prisma: { consentRecord: { upsert: jest.fn() } },
}));

const svc = require('../../src/modules/compliance/compliance.service');

describe('compliance.slaStatusFor', () => {
  const now = new Date('2026-02-01T00:00:00Z').getTime();

  it('BREACHED when past resolve-due and still open', () => {
    const t = { status: 'open', resolveDueAt: new Date(now - 1000), ackDueAt: new Date(now - 2000) };
    expect(svc.slaStatusFor(t, now)).toBe('BREACHED');
  });

  it('BREACHED when ack overdue and not acknowledged', () => {
    const t = {
      status: 'open',
      ackDueAt: new Date(now - 1000),
      acknowledgedAt: null,
      resolveDueAt: new Date(now + 20 * 24 * 3600 * 1000),
    };
    expect(svc.slaStatusFor(t, now)).toBe('BREACHED');
  });

  it('AT_RISK when within 20% of the resolve window', () => {
    const t = {
      status: 'in_progress',
      acknowledgedAt: new Date(now - 1000),
      ackDueAt: new Date(now - 2000),
      resolveDueAt: new Date(now + 2 * 24 * 3600 * 1000), // 2 days < 6-day threshold
    };
    expect(svc.slaStatusFor(t, now)).toBe('AT_RISK');
  });

  it('ON_TIME when resolved regardless of dates', () => {
    const t = { status: 'resolved', resolveDueAt: new Date(now - 100000) };
    expect(svc.slaStatusFor(t, now)).toBe('ON_TIME');
  });

  it('ON_TIME when comfortably within windows', () => {
    const t = {
      status: 'in_progress',
      acknowledgedAt: new Date(now - 1000),
      ackDueAt: new Date(now + 10000),
      resolveDueAt: new Date(now + 25 * 24 * 3600 * 1000),
    };
    expect(svc.slaStatusFor(t, now)).toBe('ON_TIME');
  });
});

describe('compliance.setConsent', () => {
  const { prisma } = require('../../src/shared/database');
  beforeEach(() => jest.clearAllMocks());

  it('upserts granted consent with a grantedAt timestamp (unbundled)', async () => {
    prisma.consentRecord.upsert.mockResolvedValue({ granted: true });
    await svc.setConsent('u1', 'MARKETING_EMAIL', true);
    const arg = prisma.consentRecord.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ userId_purpose: { userId: 'u1', purpose: 'MARKETING_EMAIL' } });
    expect(arg.create.granted).toBe(true);
  });
});
