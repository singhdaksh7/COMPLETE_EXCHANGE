import pino, { type LoggerOptions } from 'pino';
import { config } from '../config';

/**
 * Structured JSON logger (pino).
 *
 * Hard rules for a custodial system:
 *  - Never log secrets, tokens, passwords, OTPs, private keys, or full PII.
 *    The `redact` list below scrubs the common offenders defensively.
 *  - In production we emit raw JSON for shipping to a log store.
 *  - In development we pretty-print for readability.
 */
const redactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.body.password',
  'req.body.currentPassword',
  'req.body.newPassword',
  'req.body.refreshToken',
  'req.body.totp',
  'req.body.otp',
  '*.password',
  '*.passwordHash',
  '*.refreshToken',
  '*.refreshHash',
  '*.accessToken',
  '*.totpSecret',
  '*.privateKey',
];

const options: LoggerOptions = {
  level: config.log.level,
  redact: {
    paths: redactPaths,
    censor: '[REDACTED]',
  },
  base: { service: 'cex-backend', env: config.env },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
};

export const logger = config.log.pretty
  ? pino({
      ...options,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:standard' },
      },
    })
  : pino(options);

export type Logger = typeof logger;
