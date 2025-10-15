import { Resource, Action } from './../../common/enums/resource.enum';
import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Put,
  Delete,
  Param,
} from '@nestjs/common';
import {
  CreatePermissionDto,
  UpdatePermissionDto,
} from './dto/permissions.dto';
import { PermissionsService } from './permissions.service';
import { Pagination } from '../../common/decorator/pagination.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { JwtGuard } from '../auth/guards/auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermissions } from '../../common/decorator/permission.decorator';
import { InjectUpdatedBy } from '../../common/decorator/inject-updatedBy.decorator';
import { InjectCreatedBy } from '../../common/decorator/inject-createdBy.decorator';

@UseGuards(JwtGuard, PermissionGuard)
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @RequirePermissions(`${Resource.PERMISSION}:${Action.CREATE}`)
  @Post('create')
  async create(@InjectCreatedBy() createPermissionDto: CreatePermissionDto) {
    return this.permissionsService.createPermission(createPermissionDto);
  }

  @RequirePermissions(`${Resource.PERMISSION}:${Action.VIEW}`)
  @Get()
  async findAll(@Pagination() query: PaginationDto) {
    return this.permissionsService.findAll(query);
  }

  @RequirePermissions(`${Resource.PERMISSION}:${Action.VIEW}`)
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.permissionsService.findOne(+id);
  }

  @RequirePermissions(`${Resource.PERMISSION}:${Action.UPDATE}`)
  @Put(':id')
  async update(
    @Param('id') id: string,
    @InjectUpdatedBy() payload: UpdatePermissionDto,
  ) {
    return this.permissionsService.update(+id, payload);
  }

  @RequirePermissions(`${Resource.PERMISSION}:${Action.DELETE}`)
  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.permissionsService.delete(+id);
  }
}
