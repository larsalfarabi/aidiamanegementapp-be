
import { format, transports } from 'winston';
import * as DailyRotateFile from 'winston-daily-rotate-file';

export const loggerConfig = {
  transports: [
    // Console transport for development
    new transports.Console({
      format: format.combine(
        format.timestamp(),
        format.colorize(),
        format.printf(({ timestamp, level, message, context, trace }) => {
          return `${timestamp} [${context || 'Application'}] ${level}: ${message}${trace ? `\n${trace}` : ''}`;
        }),
      ),
    }),
    // File transport for error logs (daily rotation)
    new DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
      level: 'error',
      format: format.combine(format.timestamp(), format.json()),
    }),
    // File transport for all logs (combined)
    new DailyRotateFile({
      filename: 'logs/app-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
      format: format.combine(format.timestamp(), format.json()),
    }),
  ],
};
