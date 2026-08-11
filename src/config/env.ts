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

function optionalEnvBoolean(key: string, defaultValue: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined) return defaultValue;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error(`Environment variable ${key} must be true or false, got: ${raw}`);
}

export const config = {
  // ── Server ──────────────────────────────────────────────────
  nodeEnv: optionalEnv('NODE_ENV', 'development') as 'development' | 'production' | 'test',
  port: optionalEnvNumber('PORT', 3001),
  host: optionalEnv('HOST', '0.0.0.0'),
  appName: optionalEnv('APP_NAME', 'GymFlow'),
  apiPrefix: optionalEnv('API_PREFIX', '/api/v1'),
  publicApiUrl: optionalEnv('PUBLIC_API_URL', `http://localhost:${optionalEnvNumber('PORT', 3001)}`).replace(/\/$/, ''),

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

  // ── SUPER ADMIN ──────────────────────────────────────────────
  superAdmin: {
    email: requireEnv('SUPER_ADMIN_EMAIL'),
    password: requireEnv('SUPER_ADMIN_PASSWORD'),
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

  evolutionGo: {
    enabled: optionalEnvBoolean('EVOLUTION_GO_ENABLED', false),
    endpoint: optionalEnv('EVOLUTION_GO_URL', ''),
    apiKey: process.env['EVOLUTION_GO_API_KEY'],
    defaultCountryCode: optionalEnv('EVOLUTION_GO_DEFAULT_COUNTRY_CODE', '91'),
    timeoutMs: optionalEnvNumber('EVOLUTION_GO_TIMEOUT_MS', 10_000),
  },
  membershipExpirySweepIntervalMs: optionalEnvNumber('MEMBERSHIP_EXPIRY_SWEEP_INTERVAL_MS', 60 * 60 * 1000),

  // ── Derived ──────────────────────────────────────────────────
  isProduction: optionalEnv('NODE_ENV', 'development') === 'production',
  isDevelopment: optionalEnv('NODE_ENV', 'development') === 'development',
  isTest: optionalEnv('NODE_ENV', 'development') === 'test',
} as const;

export type Config = typeof config;
