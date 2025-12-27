
import { ApiProperty } from '@nestjs/swagger';

export class SalesChartDto {
  @ApiProperty({ example: 'Jan' })
  date: string;

  @ApiProperty({ example: 45000000 })
  amount: number;
}
