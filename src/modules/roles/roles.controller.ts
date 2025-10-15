import { Resource, Action } from './../../common/enums/resource.enum';
import {
  Controller,
  Get,
  Post,
  UseGuards,
  Put,
  Param,
  Delete,
} from '@nestjs/common';
import { RolesService } from './roles.service';
import { CreateRoleDto, UpdateRoleDto } from './dto/roles.dto';
import { Pagination } from '../../common/decorator/pagination.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { JwtGuard } from '../auth/guards/auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermissions } from '../../common/decorator/permission.decorator';
import { InjectUpdatedBy } from '../../common/decorator/inject-updatedBy.decorator';
import { UpdateUserDto } from '../users/dto/users.dto';
import { InjectCreatedBy } from '../../common/decorator/inject-createdBy.decorator';

@UseGuards(JwtGuard, PermissionGuard)
@Controller('roles')
export class RolesController {
  constructor(private readonly roleService: RolesService) {}

  @RequirePermissions(`${Resource.ROLE}:${Action.CREATE}`)
  @Post('create')
  async create(@InjectCreatedBy() payload: CreateRoleDto) {
    return this.roleService.create(payload);
  }

  @RequirePermissions(`${Resource.ROLE}:${Action.VIEW}`)
  @Get()
  async findAll(@Pagination() query: PaginationDto) {
    return this.roleService.findAll(query);
  }

  @RequirePermissions(`${Resource.ROLE}:${Action.VIEW}`)
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.roleService.findOne(+id);
  }

  @RequirePermissions(`${Resource.ROLE}:${Action.UPDATE}`)
  @Put(':id')
  async update(
    @Param('id') id: string,
    @InjectUpdatedBy() payload: UpdateRoleDto,
  ) {
    return this.roleService.update(+id, payload);
  }

  @RequirePermissions(`${Resource.ROLE}:${Action.DELETE}`)
  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.roleService.delete(+id);
  }
}
