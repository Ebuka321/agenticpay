import request from 'supertest';
import express from 'express';
import { HealthController } from '../healthController.js';
import pg from 'pg';
import { Redis } from 'ioredis';

jest.mock('../../config/env', () => ({
  config: {
    DATABASE_URL: 'postgres://mock',
    REDIS_URL: 'redis://mock',
    NODE_ENV: 'test',
  },
}));

jest.mock('pg', () => {
  const mPool = { query: jest.fn() };
  return { Pool: jest.fn(() => mPool) };
});
jest.mock('ioredis', () => {
  const mRedis = { ping: jest.fn() };
  return { Redis: jest.fn(() => mRedis) };
});
const app = express();
app.get('/api/health', HealthController.getHealthStatus);
app.get('/health', HealthController.getHealthStatus);

describe('HealthController health endpoints', () => {
  let pool: any;
  let redisClient: any;

  beforeEach(() => {
    pool = new pg.Pool();
    redisClient = new Redis();
    process.env.BUILD_TIMESTAMP = '2026-03-25T00:00:00.000Z';

    jest.clearAllMocks();
  });

  it('returns 200 OK from /api/health when database and redis are healthy', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    redisClient.ping.mockResolvedValueOnce('PONG');

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.build.timestamp).toBe('2026-03-25T00:00:00.000Z');
    expect(response.body.environment.name).toBe('test');
    expect(response.body.environment.nodeVersion).toBeDefined();
    expect(response.body.version).toBeDefined();
    expect(response.body.uptime).toBeDefined();
    expect(response.body.dependencies.database.status).toBe('connected');
    expect(response.body.dependencies.redis.status).toBe('connected');
  });

  it('keeps the legacy /health endpoint working', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    redisClient.ping.mockResolvedValueOnce('PONG');

    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.dependencies.database.status).toBe('connected');
    expect(response.body.dependencies.redis.status).toBe('connected');
  });

  it('returns 503 Degraded when Postgres goes down', async () => {
    pool.query.mockRejectedValueOnce(new Error('Connection forced closed'));
    redisClient.ping.mockResolvedValueOnce('PONG');

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(503);
    expect(response.body.status).toBe('degraded');
    expect(response.body.dependencies.database.status).toBe('disconnected');
  });

  it('returns 503 Degraded when Redis fails', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    redisClient.ping.mockRejectedValueOnce(new Error('Redis timeout'));

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(503);
    expect(response.body.status).toBe('degraded');
    expect(response.body.dependencies.redis.status).toBe('disconnected');
  });
});
