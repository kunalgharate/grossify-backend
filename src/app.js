const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const { rateLimit } = require('express-rate-limit');

const swaggerUi = require('swagger-ui-express');
const config = require('./shared/config');
const { swaggerSpec } = require('./shared/swagger');
const { errorHandler, notFoundHandler } = require('./shared/middleware/errorHandler');

// Module routes
const authRoutes = require('./modules/auth/auth.routes');
const userRoutes = require('./modules/users/user.routes');
const storeRoutes = require('./modules/stores/store.routes');
const productRoutes = require('./modules/products/product.routes');
const categoryRoutes = require('./modules/categories/category.routes');
const orderRoutes = require('./modules/orders/order.routes');
const paymentRoutes = require('./modules/payments/payment.routes');
const subscriptionRoutes = require('./modules/subscriptions/subscription.routes');
const deliveryRoutes = require('./modules/delivery/delivery.routes');
const notificationRoutes = require('./modules/notifications/notification.routes');
const analyticsRoutes = require('./modules/analytics/analytics.routes');
const adminRoutes = require('./modules/admin/admin.routes');
const uploadRoutes = require('./modules/uploads/upload.routes');
const offerRoutes = require('./modules/offers/offer.routes');
const reviewRoutes = require('./modules/reviews/review.routes');
const vendorRoutes = require('./modules/vendor/vendor.routes');
const searchRoutes = require('./modules/search/search.routes');
const catalogRoutes = require('./modules/catalog/catalog.routes');
const cartRoutes = require('./modules/cart/cart.routes');
const invoiceRoutes = require('./modules/invoices/invoice.routes');
const refundRoutes = require('./modules/refunds/refund.routes');
const settlementRoutes = require('./modules/settlements/settlement.routes');
const ticketRoutes = require('./modules/tickets/ticket.routes');
const referralRoutes = require('./modules/referrals/referral.routes');
const deliveryAgentRoutes = require('./modules/delivery-agent/delivery-agent.routes');

const app = express();

// ─── Security ─────────────────────────────────────────────
app.use(helmet());

// ─── CORS ─────────────────────────────────────────────────
app.use(cors({
  origin: config.nodeEnv === 'production'
    ? [config.app.url]
    : '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ─── Rate Limiting (100 req/min per IP) ───────────────────
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: 'TOO_MANY_REQUESTS', message: 'Rate limit exceeded. Try again later.' },
});
app.use('/api/', limiter);

// ─── Body Parsing ─────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Compression ──────────────────────────────────────────
app.use(compression());

// ─── Logging ──────────────────────────────────────────────
if (config.nodeEnv !== 'test') {
  app.use(morgan('dev'));
}

// ─── Swagger Docs ─────────────────────────────────────────
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/api-docs.json', (req, res) => res.json(swaggerSpec));

// ─── Health Check ─────────────────────────────────────────
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: config.app.name,
    environment: config.nodeEnv,
    timestamp: new Date().toISOString(),
  });
});

// ─── API Routes (v1) ─────────────────────────────────────
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/stores', storeRoutes);
app.use('/api/v1/products', productRoutes);
app.use('/api/v1/categories', categoryRoutes);
app.use('/api/v1/orders', orderRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/subscriptions', subscriptionRoutes);
app.use('/api/v1/delivery', deliveryRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/upload', uploadRoutes);
app.use('/api/v1/offers', offerRoutes);
app.use('/api/v1/reviews', reviewRoutes);
app.use('/api/v1/vendor', vendorRoutes);
app.use('/api/v1/search', searchRoutes);
app.use('/api/v1/catalog', catalogRoutes);
app.use('/api/v1/cart', cartRoutes);
app.use('/api/v1/invoices', invoiceRoutes);
app.use('/api/v1/refunds', refundRoutes);
app.use('/api/v1/settlements', settlementRoutes);
app.use('/api/v1/tickets', ticketRoutes);
app.use('/api/v1/referrals', referralRoutes);
app.use('/api/v1/delivery-agent', deliveryAgentRoutes);

// ─── Static uploads ───────────────────────────────────────
app.use('/uploads', express.static('uploads'));

// ─── Error Handling ───────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
