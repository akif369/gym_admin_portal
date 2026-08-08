import pino from 'pino';
import { config } from '../../config/env';

export const logger = pino({
  level: config.logLevel,
  ...(config.isDevelopment
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
            messageFormat: '[{module}] {msg}',
          },
        },
      }
    : {
        // Production: structured JSON
        formatters: {
          level: (label: string) => ({ level: label }),
        },
        timestamp: pino.stdTimeFunctions.isoTime,
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'body.password',
            'body.passwordHash',
            'body.refreshToken',
          ],
          remove: true,
        },
      }),
  base: {
    app: config.appName,
    env: config.nodeEnv,
  },
});

// ── Child Loggers ─────────────────────────────────────────────────────────────

export const createLogger = (module: string) =>
  logger.child({ module });

export type Logger = typeof logger;
