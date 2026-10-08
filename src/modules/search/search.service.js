const { prisma } = require('../../shared/database');
const config = require('../../shared/config');

/**
 * Search service with a provider abstraction:
 *   - If MEILISEARCH_API_KEY is configured AND a client is wired, use Meilisearch.
 *   - Otherwise fall back to the existing PostgreSQL (Prisma `contains`) search.
 *
 * This keeps dev/CI on Postgres (no external dependency) while allowing a
 * production Meilisearch upgrade purely by configuring env + the client. The
 * Postgres path is the tested default; the Meilisearch client itself is a
 * drop-in once the instance/keys exist (not exercised without them).
 */

const meiliEnabled = () => Boolean(config.meilisearch && config.meilisearch.apiKey);

/** Resolve a category slug → id (shared by both providers). */
async function resolveCategoryId(category) {
  if (!category) return null;
  const cat = await prisma.category.findUnique({ where: { slug: category } });
  return cat ? cat.id : null;
}

/** The canonical PostgreSQL search (extracted from the original route). */
async function postgresSearch({ q, category, page = 1, limit = 20 }) {
  const pageNum = parseInt(page) || 1;
  const limitNum = Math.min(parseInt(limit) || 20, 50);
  const categoryId = await resolveCategoryId(category);

  const storeWhere = {
    status: 'ACTIVE',
    OR: [
      { name: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
    ],
    ...(categoryId ? { categoryId } : {}),
  };
  const productWhere = {
    status: 'ACTIVE',
    store: { status: 'ACTIVE' },
    OR: [
      { name: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
    ],
    ...(categoryId ? { categoryId } : {}),
  };

  const [stores, products, total] = await Promise.all([
    prisma.store.findMany({
      where: storeWhere,
      take: 5,
      select: { id: true, name: true, slug: true, logoUrl: true, rating: true, city: true, latitude: true, longitude: true },
    }),
    prisma.product.findMany({
      where: productWhere,
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
      select: {
        id: true, name: true, images: true, sellingPrice: true, mrp: true,
        store: { select: { id: true, name: true, slug: true } },
      },
    }),
    prisma.product.count({ where: productWhere }),
  ]);

  return { results: { stores, products }, pagination: { page: pageNum, limit: limitNum, total } };
}

/** Meilisearch path — only reachable when configured. Lazily requires the SDK. */
async function meiliSearch(params) {
  // Lazy require so the dependency is optional until the upgrade is activated.
  // If the client or index is unavailable, callers fall back to Postgres.
  // eslint-disable-next-line global-require
  const { MeiliSearch } = require('meilisearch');
  const client = new MeiliSearch({ host: config.meilisearch.host, apiKey: config.meilisearch.apiKey });
  const { q, page = 1, limit = 20 } = params;
  const [stores, products] = await Promise.all([
    client.index('stores').search(q, { limit: 5 }),
    client.index('products').search(q, { limit: Math.min(parseInt(limit) || 20, 50), offset: ((parseInt(page) || 1) - 1) * (parseInt(limit) || 20) }),
  ]);
  return {
    results: { stores: stores.hits, products: products.hits },
    pagination: { page: parseInt(page) || 1, limit: parseInt(limit) || 20, total: products.estimatedTotalHits ?? products.hits.length },
  };
}

/** Public dispatcher: Meilisearch when enabled, else Postgres. Fails safe. */
async function search(params) {
  if (meiliEnabled()) {
    try {
      return await meiliSearch(params);
    } catch (err) {
      // Degrade to Postgres rather than failing search entirely.
      // eslint-disable-next-line no-console
      console.warn(`[search] Meilisearch failed, falling back to Postgres: ${err.message}`);
    }
  }
  return postgresSearch(params);
}

async function autocomplete(q) {
  if (!q || q.length < 2) return [];
  const products = await prisma.product.findMany({
    where: { name: { contains: q, mode: 'insensitive' }, status: 'ACTIVE' },
    select: { name: true },
    take: 10,
    distinct: ['name'],
  });
  return products.map((p) => p.name);
}

module.exports = { search, autocomplete, postgresSearch, meiliEnabled, resolveCategoryId };
