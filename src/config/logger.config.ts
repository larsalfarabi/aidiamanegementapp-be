import { format, transports } from 'winston';
import * as DailyRotateFile from 'winston-daily-rotate-file';

const isProduction = process.env.NODE_ENV === 'production';
const logLevel = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');

export const loggerConfig = {
  transports: [
    // Console transport
    new transports.Console({
      level: logLevel, // Dynamic level
      format: format.combine(
        format.timestamp(),
        format.colorize(),
        format.printf(({ timestamp, level, message, context, trace }) => {
          return `${timestamp} [${context || 'Application'}] ${level}: ${message}${trace ? `\n${trace}` : ''}`;
        }),
      ),
    }),
    // File transport for error logs (always error)
    new DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
      level: 'error',
      format: format.combine(format.timestamp(), format.json()),
    }),
    // File transport for all logs
    new DailyRotateFile({
      filename: 'logs/app-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
      level: logLevel, // Dynamic level
      format: format.combine(format.timestamp(), format.json()),
    }),
  ],
};
