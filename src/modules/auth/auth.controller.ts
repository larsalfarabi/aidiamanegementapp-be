import {
  Controller,
  Body,
  Post,
  UseGuards,
  Request,
  Get,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { ResponseSuccess } from '../../common/interface/response.interface';
import { LoginDto } from './dto/auth.dto';
import { JwtGuard, JwtGuardRefreshToken } from './guards/auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  async login(@Body() loginDto: LoginDto): Promise<ResponseSuccess> {
    return this.authService.login(loginDto);
  }

  @UseGuards(JwtGuard)
  @Get('profile')
  async getProfile(@Request() req: any): Promise<ResponseSuccess> {
    const userId = req.user.id;
    return this.authService.getProfile(userId);
  }

  @UseGuards(JwtGuard)
  @Post('logout')
  async logout(@Request() req: any): Promise<ResponseSuccess> {
    console.log(req);
    const userId = req.user.id;
    return this.authService.logout(userId);
  }

  @UseGuards(JwtGuardRefreshToken)
  @Post('refresh-token')
  async refreshToken(@Request() req: any): Promise<ResponseSuccess> {
    const { id } = req.user;
    const { refresh_token } = req.body;
    return this.authService.refreshToken({
      id,
      refresh_token,
    });
  }
}
