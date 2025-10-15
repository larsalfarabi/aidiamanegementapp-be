import { Injectable, ConflictException } from '@nestjs/common';
import BaseResponse from '../../common/response/base.response';
import { InjectRepository } from '@nestjs/typeorm';
import { Roles } from './entities/roles.entity';
import { Repository } from 'typeorm';
import {
  ResponseSuccess,
  ResponsePagination,
} from '../../common/interface/response.interface';
import { CreateRoleDto, UpdateRoleDto } from './dto/roles.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { NotFoundException } from '@nestjs/common/exceptions';

@Injectable()
export class RolesService extends BaseResponse {
  constructor(
    @InjectRepository(Roles)
    private readonly rolesRepository: Repository<Roles>,
  ) {
    super();
  }

  async create(payload: CreateRoleDto): Promise<ResponseSuccess> {
    const checkExist = await this.rolesRepository.findOne({
      where: {
        name: payload.name,
      },
    });
    if (checkExist) {
      throw new ConflictException('Role already exists');
    }
    const { permissions, ...roleData } = payload;
    const role = await this.rolesRepository.save(roleData);

    if (permissions && permissions.length > 0) {
      await this.rolesRepository
        .createQueryBuilder()
        .relation(Roles, 'permissions')
        .of(role)
        .add(permissions);
    }

    return this._success('Role created successfully');
  }

  async findAll(query: PaginationDto): Promise<ResponsePagination> {
    const { page, pageSize, limit } = query;
    const [roles, total] = await this.rolesRepository.findAndCount({
      take: pageSize,
      skip: limit,
    });
    return this._pagination(
      'Roles retrieved successfully',
      roles,
      total,
      page!,
      pageSize!,
    );
  }

  async findOne(id: number): Promise<ResponseSuccess> {
    const result = await this.rolesRepository.findOne({
      where: { id },
      relations: ['permissions', 'users'],
    });

    if (!result) throw new NotFoundException('Data role tidak ditemukan');

    return this._success(
      `Berhasil mengambil data role dengan id ${id}`,
      result,
    );
  }

  async update(id: number, payload: UpdateRoleDto): Promise<ResponseSuccess> {
    const { permissions, ...roleData } = payload;
    const result = await this.rolesRepository.update(id, roleData);

    if (result.affected === 0)
      throw new NotFoundException('Data role tidak ditemukan');

    if (permissions !== undefined) {
      await this.rolesRepository
        .createQueryBuilder()
        .relation(Roles, 'permissions')
        .of(id)
        .addAndRemove(
          permissions,
          (await this.rolesRepository
            .createQueryBuilder()
            .relation(Roles, 'permissions')
            .of(id)
            .loadMany()) as any,
        ); // hapus semua yang lama, ganti dengan yang baru
    }
    return this._success(`Berhasil update role dengan id ${id}`);
  }

  async delete(id: number): Promise<ResponseSuccess> {
    const result = await this.rolesRepository.delete(id);

    if (result.affected === 0)
      throw new NotFoundException('Data role tidak ditemukan');

    return this._success(`Berhasil menghapus role dengan id ${id}`);
  }
}
