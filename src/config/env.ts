import * as dotenv from 'dotenv';

dotenv.config();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalEnv(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

function optionalEnvNumber(key: string, defaultValue: number): number {
  const raw = process.env[key];
  if (!raw) return defaultValue;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed)) throw new Error(`Environment variable ${key} must be a number, got: ${raw}`);
  return parsed;
}

export const config = {
  // ── Server ──────────────────────────────────────────────────
  nodeEnv: optionalEnv('NODE_ENV', 'development') as 'development' | 'production' | 'test',
  port: optionalEnvNumber('PORT', 3001),
  host: optionalEnv('HOST', '0.0.0.0'),
  appName: optionalEnv('APP_NAME', 'GymFlow'),
  apiPrefix: optionalEnv('API_PREFIX', '/api/v1'),

  // ── Database ─────────────────────────────────────────────────
  databaseUrl: requireEnv('DATABASE_URL'),

  // ── JWT ──────────────────────────────────────────────────────
  jwt: {
    accessSecret: requireEnv('JWT_ACCESS_SECRET'),
    refreshSecret: requireEnv('JWT_REFRESH_SECRET'),
    accessExpiresIn: optionalEnv('JWT_ACCESS_EXPIRES_IN', '15m'),
    refreshExpiresIn: optionalEnv('JWT_REFRESH_EXPIRES_IN', '7d'),
    refreshExpiresInMs: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
  },

  // ── CORS ─────────────────────────────────────────────────────
  corsOrigins: optionalEnv('CORS_ORIGIN', 'http://localhost:3000').split(',').map(s => s.trim()),

  // ── Rate Limiting ────────────────────────────────────────────
  rateLimitMax: optionalEnvNumber('RATE_LIMIT_MAX', 100),
  authRateLimitMax: optionalEnvNumber('AUTH_RATE_LIMIT_MAX', 10),

  // ── File Uploads ─────────────────────────────────────────────
  uploadDir: optionalEnv('UPLOAD_DIR', './uploads'),
  maxFileSizeMb: optionalEnvNumber('MAX_FILE_SIZE_MB', 5),

  // ── Security ─────────────────────────────────────────────────
  passwordResetTokenExpiresMinutes: optionalEnvNumber('PASSWORD_RESET_TOKEN_EXPIRES_MINUTES', 60),
  maxFailedLoginAttempts: optionalEnvNumber('MAX_FAILED_LOGIN_ATTEMPTS', 5),
  accountLockoutDurationMinutes: optionalEnvNumber('ACCOUNT_LOCKOUT_DURATION_MINUTES', 30),

  // ── Logging ──────────────────────────────────────────────────
  logLevel: optionalEnv('LOG_LEVEL', 'info') as 'debug' | 'info' | 'warn' | 'error',

  // ── Derived ──────────────────────────────────────────────────
  isProduction: optionalEnv('NODE_ENV', 'development') === 'production',
  isDevelopment: optionalEnv('NODE_ENV', 'development') === 'development',
  isTest: optionalEnv('NODE_ENV', 'development') === 'test',
} as const;

export type Config = typeof config;
