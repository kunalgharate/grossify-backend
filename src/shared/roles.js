/**
 * RBAC role reconciliation — the single source of truth that maps the seeded,
 * Title-Case DB role names (PRD §4.2.3: "Super Admin", "Admin", "Manager",
 * "Support Agent") to the lowercase "logical" roles the API returns and the
 * Flutter client routes on (admin/manager/support/vendor/delivery/customer).
 *
 * Why this exists: the DB stores roles as human-readable rows, but the client
 * and internal checks speak a stable lowercase vocabulary. Historically the
 * login context resolver and the order-access check compared lowercase strings
 * against Title-Case DB names, so those comparisons NEVER matched and staff
 * privilege was silently broken. Centralising the mapping in one pure module
 * (no DB, no I/O) means every gate, `resolveUserContext`, and the order-access
 * check agree — and the mapping stays unit-testable without a database.
 */

// Logical role identifiers — the stable API contract consumed by the client.
const LOGICAL = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  SUPPORT: 'support',
  VENDOR: 'vendor',
  DELIVERY: 'delivery',
  CUSTOMER: 'customer',
};

// Seeded DB Role.name → logical role. "Super Admin" collapses to `admin`: the
// client has no separate super-admin surface, so both land on the admin panel.
// The finer Super-Admin/Admin distinction (e.g. roles.delete, settings.edit)
// is enforced by the seeded permission matrix via authorize(permissionCode).
const DB_ROLE_TO_LOGICAL = {
  'Super Admin': LOGICAL.ADMIN,
  Admin: LOGICAL.ADMIN,
  Manager: LOGICAL.MANAGER,
  'Support Agent': LOGICAL.SUPPORT,
};

// DB role names that grant back-office (staff) access — for direct Prisma
// `role.name IN (...)` queries where we want to match on DB truth.
const STAFF_DB_ROLE_NAMES = Object.keys(DB_ROLE_TO_LOGICAL);

// Logical roles considered "staff" (allowed to open the admin/ops panel).
const STAFF_LOGICAL_ROLES = [LOGICAL.ADMIN, LOGICAL.MANAGER, LOGICAL.SUPPORT];

// Highest-privilege-first ordering used to pick a user's primary role, which
// drives default post-login routing on the client.
const ROLE_PRIORITY = [
  LOGICAL.ADMIN,
  LOGICAL.MANAGER,
  LOGICAL.SUPPORT,
  LOGICAL.DELIVERY,
  LOGICAL.VENDOR,
  LOGICAL.CUSTOMER,
];

/** Map one DB role name to its logical role, or null if unrecognized. */
function toLogicalRole(dbName) {
  return DB_ROLE_TO_LOGICAL[dbName] || null;
}

/** Map an array of DB role names to a Set of logical staff roles. */
function mapDbRolesToLogical(dbNames = []) {
  const out = new Set();
  for (const name of dbNames) {
    const logical = toLogicalRole(name);
    if (logical) out.add(logical);
  }
  return out;
}

/** Pick the highest-priority logical role from a Set/array (default customer). */
function pickPrimaryRole(roles) {
  const set = roles instanceof Set ? roles : new Set(roles);
  return ROLE_PRIORITY.find((r) => set.has(r)) || LOGICAL.CUSTOMER;
}

module.exports = {
  LOGICAL,
  DB_ROLE_TO_LOGICAL,
  STAFF_DB_ROLE_NAMES,
  STAFF_LOGICAL_ROLES,
  ROLE_PRIORITY,
  toLogicalRole,
  mapDbRolesToLogical,
  pickPrimaryRole,
};
