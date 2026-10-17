const { randomUUID } = require('crypto');

const REQUIRED_TYPES = ['TOS', 'PRIVACY'];

async function acceptCurrentOrderPolicies(prisma, userId) {
  const currentPolicies = await prisma.policyVersion.findMany({
    where: { isCurrent: true, policyType: { in: REQUIRED_TYPES } },
    select: { id: true, policyType: true, version: true },
  });
  const createdPolicyIds = [];
  const versions = new Map(currentPolicies.map((policy) => [policy.policyType, policy]));

  for (const policyType of REQUIRED_TYPES) {
    if (versions.has(policyType)) continue;
    const policy = await prisma.policyVersion.create({
      data: {
        policyType,
        version: `integration-${randomUUID()}`,
        effectiveAt: new Date(),
        isCurrent: true,
      },
      select: { id: true, policyType: true, version: true },
    });
    versions.set(policyType, policy);
    createdPolicyIds.push(policy.id);
  }

  await prisma.policyAcceptance.createMany({
    data: REQUIRED_TYPES.map((policyType) => ({
      userId,
      policyType,
      version: versions.get(policyType).version,
    })),
  });

  return async () => {
    await prisma.policyAcceptance.deleteMany({
      where: { userId, policyType: { in: REQUIRED_TYPES } },
    });
    if (createdPolicyIds.length) {
      await prisma.policyVersion.deleteMany({ where: { id: { in: createdPolicyIds } } });
    }
  };
}

module.exports = { acceptCurrentOrderPolicies };
