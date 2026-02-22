import { IsNotEmpty, IsNumber, IsOptional, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePackagingMaterialDto {
  @ApiProperty({ description: 'ID Product Code dari barang kemasan' })
  @IsNotEmpty({ message: 'Material Product Code ID wajib diisi' })
  @IsNumber({}, { message: 'Material Product Code ID harus berupa angka' })
  materialProductCodeId: number;

  @ApiPropertyOptional({
    description: 'Jumlah kemasan per 1 unit barang jadi',
    default: 1,
  })
  @IsOptional()
  @IsNumber({}, { message: 'Quantity harus berupa angka' })
  @Min(0, { message: 'Quantity tidak boleh kurang dari 0' })
  quantity?: number;

  // Injected by decorator
  createdBy?: number;
}

export class UpdatePackagingMaterialDto {
  @ApiPropertyOptional({ description: 'Jumlah kemasan per 1 unit barang jadi' })
  @IsOptional()
  @IsNumber({}, { message: 'Quantity harus berupa angka' })
  @Min(0, { message: 'Quantity tidak boleh kurang dari 0' })
  quantity?: number;

  @ApiPropertyOptional({ description: 'Status aktif' })
  @IsOptional()
  isActive?: boolean;

  // Injected by decorator
  updatedBy?: number;
}
