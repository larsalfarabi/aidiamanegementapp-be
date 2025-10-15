import { PickType } from '@nestjs/swagger';
import { UserDto } from '../../users/dto/users.dto';
import { IsString, IsNotEmpty, IsNumber } from 'class-validator';

export class LoginDto extends PickType(UserDto, ['email', 'password']) {}

export class RefreshTokenDto {
  @IsNumber()
  id: number;

  @IsString()
  @IsNotEmpty({ message: 'Refresh token is required' })
  refresh_token: string;
}
