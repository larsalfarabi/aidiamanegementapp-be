import { Body, Controller, Logger, Post } from '@nestjs/common';
import { CreateLogDto } from './dto/create-log.dto';

@Controller('logs')
export class LogsController {
  private readonly logger = new Logger('Frontend');

  @Post()
  create(@Body() createLogDto: CreateLogDto) {
    const { level, message, context, meta } = createLogDto;
    const finalContext = context ? `Frontend:${context}` : 'Frontend';
    const finalMeta = meta ? JSON.stringify(meta) : '';

    switch (level) {
      case 'error':
        this.logger.error(`${message} ${finalMeta}`, '', finalContext);
        break;
      case 'warn':
        this.logger.warn(`${message} ${finalMeta}`, finalContext);
        break;
      case 'debug':
        this.logger.debug(`${message} ${finalMeta}`, finalContext);
        break;
      default:
        this.logger.log(`${message} ${finalMeta}`, finalContext);
        break;
    }

    return { success: true };
  }
}
