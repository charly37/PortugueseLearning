import pino, { LoggerOptions } from 'pino';

// One JSON object per line on stdout. Docker and Kubernetes capture that
// stream; a cluster log collector forwards it to VictoriaLogs. No log files.

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
type LogLevel = (typeof LOG_LEVELS)[number];

const DEFAULT_LEVELS: Record<string, LogLevel> = {
  production: 'info',
  development: 'info',
  test: 'silent',
};

function defaultLevel(): LogLevel {
  return DEFAULT_LEVELS[process.env.NODE_ENV ?? ''] ?? 'info';
}

function resolveLevel(): { level: LogLevel; invalid?: string } {
  const configured = process.env.LOG_LEVEL?.trim().toLowerCase();

  if (!configured) {
    return { level: defaultLevel() };
  }

  if ((LOG_LEVELS as readonly string[]).includes(configured)) {
    return { level: configured as LogLevel };
  }

  return { level: defaultLevel(), invalid: configured };
}

const { level, invalid } = resolveLevel();

const options: LoggerOptions = {
  level,
  base: {
    service: 'portuguese-learning',
    env: process.env.NODE_ENV ?? 'development',
    ...(process.env.APP_VERSION ? { version: process.env.APP_VERSION } : {}),
  },
  // ISO 8601 timestamps are unambiguous and parseable by VictoriaLogs.
  timestamp: pino.stdTimeFunctions.isoTime,
  // pino's default message key matches the collector's `_msg_field=msg`.
  messageKey: 'msg',
  formatters: {
    // Emit "level":"error" instead of the numeric 50.
    level: (label) => ({ level: label }),
  },
  serializers: {
    // log.error({ err }) -> err.type / err.message / err.stack instead of {}
    err: pino.stdSerializers.err,
  },
  // Defense in depth: we never log request bodies, but redact just in case.
  redact: ['password', 'req.headers.cookie', 'req.headers.authorization'],
};

const logger = pino(options);

if (invalid) {
  logger.warn(
    { configuredLevel: invalid, fallbackLevel: level },
    'Invalid LOG_LEVEL; falling back to the environment default'
  );
}

export default logger;
