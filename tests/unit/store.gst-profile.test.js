jest.mock('../../src/shared/database', () => ({
  prisma: {
    store: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    category: {
      findUnique: jest.fn(),
    },
  },
}));

const { prisma } = require('../../src/shared/database');
const storeService = require('../../src/modules/stores/store.service');

const STORE_ID = 'store-1';
const OWNER_ID = 'owner-1';

beforeEach(() => {
  jest.clearAllMocks();
  prisma.category.findUnique.mockResolvedValue({ id: 'category-1' });
  prisma.store.create.mockImplementation(({ data }) => Promise.resolve(data));
  prisma.store.findUnique.mockResolvedValue({
    id: STORE_ID,
    ownerId: OWNER_ID,
    gstScheme: 'UNREGISTERED',
    gstNumber: null,
    stateCode: null,
  });
  prisma.store.update.mockImplementation(({ data }) => Promise.resolve(data));
});

describe('store.service GST profile updates', () => {
  it('validates and normalizes GST details during store registration', async () => {
    await storeService.create(OWNER_ID, {
      name: 'Fresh Market',
      categoryId: 'category-1',
      address: '1 Market Road',
      city: 'Nashik',
      state: 'Maharashtra',
      pincode: '422001',
      latitude: 19.99,
      longitude: 73.78,
      gstScheme: 'REGULAR',
      gstNumber: '27abcde1234f1z5',
      stateCode: 27,
    });

    expect(prisma.store.create.mock.calls[0][0].data).toMatchObject({
      gstScheme: 'REGULAR',
      gstNumber: '27ABCDE1234F1Z5',
      stateCode: 27,
    });
  });

  it('rejects a GSTIN without a registered scheme during store registration', async () => {
    await expect(storeService.create(OWNER_ID, {
      name: 'Fresh Market',
      categoryId: 'category-1',
      address: '1 Market Road',
      city: 'Nashik',
      state: 'Maharashtra',
      pincode: '422001',
      latitude: 19.99,
      longitude: 73.78,
      gstNumber: '27ABCDE1234F1Z5',
    })).rejects.toThrow('UNREGISTERED stores cannot have a GSTIN');

    expect(prisma.store.create).not.toHaveBeenCalled();
  });

  it('normalizes and saves a valid registered GST profile', async () => {
    await storeService.update(STORE_ID, OWNER_ID, {
      gstScheme: 'REGULAR',
      gstNumber: '27abcde1234f1z5',
      stateCode: 27,
    });

    expect(prisma.store.update).toHaveBeenCalledWith({
      where: { id: STORE_ID },
      data: {
        gstScheme: 'REGULAR',
        gstNumber: '27ABCDE1234F1Z5',
        stateCode: 27,
      },
    });
  });

  it('accepts a valid composition GST profile', async () => {
    await storeService.update(STORE_ID, OWNER_ID, {
      gstScheme: 'COMPOSITION',
      gstNumber: '27ABCDE1234F1Z5',
      stateCode: 27,
    });

    expect(prisma.store.update).toHaveBeenCalledWith({
      where: { id: STORE_ID },
      data: {
        gstScheme: 'COMPOSITION',
        gstNumber: '27ABCDE1234F1Z5',
        stateCode: 27,
      },
    });
  });

  it('allows an unregistered profile without a GSTIN', async () => {
    await storeService.update(STORE_ID, OWNER_ID, {
      gstScheme: 'UNREGISTERED',
      gstNumber: null,
      stateCode: 27,
    });

    expect(prisma.store.update).toHaveBeenCalledWith({
      where: { id: STORE_ID },
      data: {
        gstScheme: 'UNREGISTERED',
        gstNumber: null,
        stateCode: 27,
      },
    });
  });

  it('rejects registered GST details whose GSTIN state differs from the state selection', async () => {
    await expect(storeService.update(STORE_ID, OWNER_ID, {
      gstScheme: 'REGULAR',
      gstNumber: '27ABCDE1234F1Z5',
      stateCode: 29,
    })).rejects.toThrow('GSTIN state code must match the selected state');

    expect(prisma.store.update).not.toHaveBeenCalled();
  });

  it('requires a GSTIN and state code for a registered scheme', async () => {
    await expect(storeService.update(STORE_ID, OWNER_ID, {
      gstScheme: 'COMPOSITION',
    })).rejects.toThrow('A valid GSTIN is required for registered GST schemes');
    expect(prisma.store.update).not.toHaveBeenCalled();
  });

  it('rejects a malformed GSTIN before writing the profile', async () => {
    await expect(storeService.update(STORE_ID, OWNER_ID, {
      gstScheme: 'REGULAR',
      gstNumber: 'not-a-gstin',
      stateCode: 27,
    })).rejects.toThrow('A valid GSTIN is required for registered GST schemes');
    expect(prisma.store.update).not.toHaveBeenCalled();
  });

  it('rejects a GSTIN for an unregistered store', async () => {
    await expect(storeService.update(STORE_ID, OWNER_ID, {
      gstScheme: 'UNREGISTERED',
      gstNumber: '27ABCDE1234F1Z5',
    })).rejects.toThrow('UNREGISTERED stores cannot have a GSTIN');
    expect(prisma.store.update).not.toHaveBeenCalled();
  });

  it('rejects invalid state codes and non-owner updates', async () => {
    await expect(storeService.update(STORE_ID, OWNER_ID, {
      stateCode: 0,
    })).rejects.toThrow('stateCode must be a valid GST state code');
    await expect(storeService.update(STORE_ID, 'other-user', {
      gstScheme: 'REGULAR',
    })).rejects.toThrow('You can only update your own store');
    expect(prisma.store.update).not.toHaveBeenCalled();
  });
});
