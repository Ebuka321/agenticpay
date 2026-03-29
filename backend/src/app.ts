import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import path from 'path';
import config from './config/index.js';
import { config as envConfig } from './config/env.js';
import logger from './utils/logger.js';
import passport from './config/passport.js';
import { apiVersionMiddleware } from './middlewares/apiVersionMiddleware.js';
import { apiRateLimit, authRateLimit, dataRateLimit } from './middlewares/rateLimitMiddleware.js';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swaggerConfig.js';
import fs from 'fs';

// Feature Routes
import v1Routes from './routes/v1/index.js';
import authRoutes from './routes/authRoutes.js';
import webhookRoutes from './routes/webhook.routes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import { HealthController } from './controllers/healthController.js';

// Upstream Routes
import payrollAuditRoutes from './routes/payrollAuditRoutes.js';
import payrollRoutes from './routes/payroll.routes.js';
import employeeRoutes from './routes/employeeRoutes.js';
import assetRoutes from './routes/assetRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import searchRoutes from './routes/searchRoutes.js';
import contractRoutes from './routes/contractRoutes.js';
import ratesRoutes from './routes/ratesRoutes.js';
import stellarThrottlingRoutes from './routes/stellarThrottlingRoutes.js';

const __appFilename = fileURLToPath(import.meta.url);
const __appDirname = path.dirname(__appFilename);

// ── CORS allowlist ────────────────────────────────────────────────────────────
// Build the set of permitted origins from env vars:
//   CORS_ORIGIN              – primary origin (default: http://localhost:5173)
//   CORS_ALLOWED_ORIGINS     – comma-separated list of additional origins
//                              e.g. "https://app.payd.io,https://staging.payd.io"
const buildAllowedOrigins = (): Set<string> => {
  const origins = new Set<string>();
  if (envConfig.CORS_ORIGIN) {
    envConfig.CORS_ORIGIN.split(',').forEach((o) => origins.add(o.trim()));
  }
  if (envConfig.CORS_ALLOWED_ORIGINS) {
    envConfig.CORS_ALLOWED_ORIGINS.split(',').forEach((o) => origins.add(o.trim()));
  }
  return origins;
};

const allowedOrigins = buildAllowedOrigins();

const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow server-to-server requests (no Origin header) only in non-production.
    if (!origin) {
      if (envConfig.NODE_ENV !== 'production') return callback(null, true);
      return callback(new Error('CORS: server-to-server requests not allowed in production'));
    }
    if (allowedOrigins.has(origin)) {
      return callback(null, true);
    }
    logger.warn(`CORS: blocked request from disallowed origin "${origin}"`);
    return callback(new Error(`CORS: origin "${origin}" is not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Version'],
};

const app = express();

// Middleware
app.use(helmet());
app.use(cors(corsOptions));
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(passport.initialize());

// Serve stellar.toml for SEP-0001
app.get('/.well-known/stellar.toml', (req, res) => {
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.sendFile(path.join(__appDirname, '../.well-known/stellar.toml'));
});

// Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/api/openapi.json', (req, res) => {
  res.json(swaggerSpec);
});

// Export openapi.json for frontend
fs.writeFileSync(path.join(__appDirname, '../openapi.json'), JSON.stringify(swaggerSpec, null, 2));

// Middleware for versioning
app.use(apiVersionMiddleware);

// ---------------------------------------------------------------------------
// Versioned API — canonical entry point
// ---------------------------------------------------------------------------
app.use('/api/v1', apiRateLimit(), v1Routes);

// API root — discovery endpoint
app.get('/api', (_req, res) => {
  res.json({
    name: 'PayD API',
    currentVersion: 'v1',
    supportedVersions: ['v1'],
    endpoints: { v1: '/api/v1' },
  });
});

// ---------------------------------------------------------------------------
// Legacy routes (deprecated — sunset 2027-01-01)
// Deprecation headers are injected automatically by apiVersionMiddleware.
// ---------------------------------------------------------------------------
app.use('/rates', dataRateLimit(), ratesRoutes);
app.use('/auth', authRateLimit(), authRoutes);
app.use('/webhooks', apiRateLimit(), webhookRoutes);
app.use('/api/notifications', apiRateLimit(), notificationRoutes);
app.use('/api/auth', authRateLimit(), authRoutes);
app.use('/api/payroll/audit', apiRateLimit(), payrollAuditRoutes);
app.use('/api/payroll', apiRateLimit(), payrollRoutes);
app.use('/api/employees', dataRateLimit(), employeeRoutes);
app.use('/api/assets', dataRateLimit(), assetRoutes);
app.use('/api/payments', apiRateLimit(), paymentRoutes);
app.use('/api/search', dataRateLimit(), searchRoutes);
app.use('/api', apiRateLimit(), contractRoutes);
app.use('/api/stellar-throttling', apiRateLimit(), stellarThrottlingRoutes);

// Health check endpoints
app.get('/api/health', HealthController.getHealthStatus);
app.get('/health', HealthController.getHealthStatus);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path,
  });
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: config.nodeEnv === 'development' ? err.message : 'An error occurred',
  });
});

export default app;
