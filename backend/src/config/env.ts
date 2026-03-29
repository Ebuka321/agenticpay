import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('3000'),
  DATABASE_URL: z.string().default('postgres://localhost:5432/payd_test'),
  REDIS_URL: z.string().optional(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  CORS_ALLOWED_ORIGINS: z.string().optional(),
  THROTTLING_TPM: z.string().default('100'),
  THROTTLING_MAX_QUEUE_SIZE: z.string().default('1000'),
  THROTTLING_REFILL_INTERVAL_MS: z.string().default('1000'),
  RATE_LIMIT_AUTH_WINDOW_MS: z.string().default('900000'),
  RATE_LIMIT_AUTH_MAX: z.string().default('10'),
  RATE_LIMIT_API_WINDOW_MS: z.string().default('60000'),
  RATE_LIMIT_API_MAX: z.string().default('100'),
  RATE_LIMIT_DATA_WINDOW_MS: z.string().default('60000'),
  RATE_LIMIT_DATA_MAX: z.string().default('200'),
  JWT_SECRET: z.string().default('dev-jwt-secret'),
  JWT_REFRESH_SECRET: z.string().default('dev-jwt-refresh-secret'),
  // Email notification configuration
  EMAIL_PROVIDER: z.enum(['resend', 'sendgrid']).default('resend'),
  EMAIL_FROM_ADDRESS: z.string().default('noreply@payd.example.com'),
  EMAIL_FROM_NAME: z.string().default('PayD Payroll System'),
  RESEND_API_KEY: z.string().optional(),
  SENDGRID_API_KEY: z.string().optional(),
  STELLAR_EXPLORER_URL: z.string().default('https://stellar.expert/explorer/testnet/tx'),
  STELLAR_NETWORK: z.enum(['testnet', 'mainnet', 'public']).default('testnet'),
  STELLAR_HORIZON_URL: z.string().optional(),
  STELLAR_MAX_RETRIES: z.string().default('3'),
  STELLAR_RETRY_DELAY_MS: z.string().default('1000'),
  STELLAR_RETRY_DELAY_MAX_MS: z.string().default('10000'),
});

export const config = envSchema.parse(process.env);

export const getThrottlingConfig = () => ({
  tpm: parseInt(config.THROTTLING_TPM, 10),
  maxQueueSize: parseInt(config.THROTTLING_MAX_QUEUE_SIZE, 10),
  refillIntervalMs: parseInt(config.THROTTLING_REFILL_INTERVAL_MS, 10),
});

export const getRateLimitConfig = () => ({
  auth: {
    windowMs: parseInt(config.RATE_LIMIT_AUTH_WINDOW_MS, 10),
    maxRequests: parseInt(config.RATE_LIMIT_AUTH_MAX, 10),
  },
  api: {
    windowMs: parseInt(config.RATE_LIMIT_API_WINDOW_MS, 10),
    maxRequests: parseInt(config.RATE_LIMIT_API_MAX, 10),
  },
  data: {
    windowMs: parseInt(config.RATE_LIMIT_DATA_WINDOW_MS, 10),
    maxRequests: parseInt(config.RATE_LIMIT_DATA_MAX, 10),
  },
});
