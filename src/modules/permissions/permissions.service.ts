import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Injectable } from '@nestjs/common';
import BaseResponse from '../../common/response/base.response';
import { ResponseSuccess } from '../../common/interface/response.interface';
import { Permissions } from './entity/permissions.entity';
import {
  CreatePermissionDto,
  UpdatePermissionDto,
} from './dto/permissions.dto';
import { ResponsePagination } from '../../common/interface/response.interface';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { NotFoundException } from '@nestjs/common/exceptions';

@Injectable()
export class PermissionsService extends BaseResponse {
  constructor(
    @InjectRepository(Permissions)
    private readonly permissionRepo: Repository<Permissions>,
  ) {
    super();
  }

  async createPermission(
    payload: CreatePermissionDto,
  ): Promise<ResponseSuccess> {
    await this.permissionRepo.save({ ...payload });
    return this._success('Berhasil membuat data permission');
  }

  async findAll(query: PaginationDto): Promise<ResponsePagination> {
    const { page, pageSize, limit, search } = query;

    const whereCondition = search
      ? [
          {
            name: Like(`%${search}%`),
          },
          {
            description: Like(`%${search}%`),
          },
        ]
      : {};

    const [result, count] = await this.permissionRepo.findAndCount({
      where: whereCondition,
      skip: limit,
      take: pageSize,
    });
    return this._pagination(
      'Berhasil mendapatkan data permission',
      result,
      count,
      page!,
      pageSize!,
    );
  }

  async findOne(id: number): Promise<ResponseSuccess> {
    const result = await this.permissionRepo.findOne({
      where: { id },
    });

    if (!result) throw new NotFoundException('Data permission tidak ditemukan');

    return this._success(
      `Berhasil mengambil data permission dengan id ${id}`,
      result,
    );
  }

  async update(
    id: number,
    payload: UpdatePermissionDto,
  ): Promise<ResponseSuccess> {
    const result = await this.permissionRepo.update(id, payload);

    if (result.affected === 0) {
      throw new NotFoundException('Data Permission tidak ditemukan');
    }
    return this._success(`Berhasil update permission dengan id ${id}`);
  }

  async delete(id: number): Promise<ResponseSuccess> {
    const result = await this.permissionRepo.delete(id);

    if (result.affected === 0)
      throw new NotFoundException('Data permission tidak ditemukan');

    return this._success(`Berhasil menghapus permission dengan id ${id}`);
  }
}
