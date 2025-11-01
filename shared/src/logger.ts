type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

interface LogEntry {
  level: LogLevel;
  message: string;
  service: string;
  timestamp: string;
  traceId?: string;
  [key: string]: unknown;
}

const LOG_LEVELS: Record<LogLevel, number> = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const MIN_LEVEL = (process.env.LOG_LEVEL as LogLevel) ?? 'INFO';

function emit(entry: LogEntry): void {
  if (LOG_LEVELS[entry.level] < LOG_LEVELS[MIN_LEVEL]) return;
  const out = JSON.stringify(entry);
  if (entry.level === 'ERROR') console.error(out);
  else console.log(out);
}

export function createLogger(service: string) {
  const log = (level: LogLevel, message: string, extra?: Record<string, unknown>) => {
    emit({
      level,
      message,
      service,
      timestamp: new Date().toISOString(),
      traceId: process.env._X_AMZN_TRACE_ID,
      ...extra,
    });
  };

  return {
    debug: (msg: string, extra?: Record<string, unknown>) => log('DEBUG', msg, extra),
    info: (msg: string, extra?: Record<string, unknown>) => log('INFO', msg, extra),
    warn: (msg: string, extra?: Record<string, unknown>) => log('WARN', msg, extra),
    error: (msg: string, extra?: Record<string, unknown>) => log('ERROR', msg, extra),
  };
}
