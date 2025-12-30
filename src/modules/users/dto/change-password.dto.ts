import { IsNotEmpty, IsString, MinLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty({
    description: 'Kata sandi saat ini',
    example: 'currentPassword123',
  })
  @IsNotEmpty({ message: 'Kata sandi saat ini wajib diisi' })
  @IsString()
  currentPassword: string;

  @ApiProperty({
    description: 'Kata sandi baru (minimal 8 karakter)',
    example: 'newPassword123',
    minLength: 8,
  })
  @IsNotEmpty({ message: 'Kata sandi baru wajib diisi' })
  @IsString()
  @MinLength(8, { message: 'Kata sandi baru minimal 8 karakter' })
  @Matches(/^(?=.*[a-zA-Z])(?=.*\d)/, {
    message: 'Kata sandi harus mengandung huruf dan angka',
  })
  newPassword: string;

  @ApiProperty({
    description: 'Konfirmasi kata sandi baru',
    example: 'newPassword123',
  })
  @IsNotEmpty({ message: 'Konfirmasi kata sandi wajib diisi' })
  @IsString()
  confirmPassword: string;
}
