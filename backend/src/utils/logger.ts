enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

const levelMap: Record<string, LogLevel> = {
  debug: LogLevel.DEBUG,
  info: LogLevel.INFO,
  warn: LogLevel.WARN,
  error: LogLevel.ERROR,
};

/**
 * Singleton structured logger with leveled logging (DEBUG, INFO, WARN, ERROR).
 * Supports structured data logging with ISO timestamps.
 * Default level: INFO
 */
export class Logger {
  private static instance: Logger;
  private level: LogLevel;

  private constructor(level: string = 'info') {
    this.level = levelMap[level.toLowerCase()] || LogLevel.INFO;
  }

  /**
   * Gets the singleton logger instance (creates if not exists).
   *
   * @param level - Optional log level override ('debug'|'info'|'warn'|'error')
   * @returns The logger instance
   */
  static getInstance(level?: string): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(level);
    }
    return Logger.instance;
  }

  /**
   * Formats log messages with timestamp and optional structured data.
   *
   * @param level - Log level string
   * @param message - Log message
   * @param data - Optional structured data
   * @returns Formatted log string
   */
  private formatMessage(level: string, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const meta = data ? ` | ${JSON.stringify(data)}` : '';
    return `[${timestamp}] [${level}] ${message}${meta}`;
  }

  /**
   * Logs a DEBUG level message (lowest priority).
   *
   * @param message - Log message
   * @param data - Optional structured data to log
   */
  debug(message: string, data?: any): void {
    if (this.level <= LogLevel.DEBUG) {
      console.debug(this.formatMessage('DEBUG', message, data));
    }
  }

  /**
   * Logs an INFO level message.
   *
   * @param message - Log message
   * @param data - Optional structured data to log
   */
  info(message: string, data?: any): void {
    if (this.level <= LogLevel.INFO) {
      console.log(this.formatMessage('INFO', message, data));
    }
  }

  /**
   * Logs a WARN level message.
   *
   * @param message - Log message
   * @param data - Optional structured data to log
   */
  warn(message: string, data?: any): void {
    if (this.level <= LogLevel.WARN) {
      console.warn(this.formatMessage('WARN', message, data));
    }
  }

  /**
   * Logs an ERROR level message (highest priority).
   * Automatically extracts error.message if Error instance provided.
   *
   * @param message - Log message
   * @param error - Optional error object or data to log
   */
  error(message: string, error?: any): void {
    if (this.level <= LogLevel.ERROR) {
      const errorData = error instanceof Error ? error.message : error;
      console.error(this.formatMessage('ERROR', message, errorData));
    }
  }
}

export default Logger.getInstance();
