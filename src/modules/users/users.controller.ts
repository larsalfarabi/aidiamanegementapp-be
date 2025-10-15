import { Resource, Action } from './../../common/enums/resource.enum';
import {
  Controller,
  Get,
  UseGuards,
  Param,
  Post,
  Put,
  Delete,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtGuard } from '../auth/guards/auth.guard';
import { Pagination } from '../../common/decorator/pagination.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermissions } from '../../common/decorator/permission.decorator';
import { InjectCreatedBy } from '../../common/decorator/inject-createdBy.decorator';
import { CreateUserDto, UpdateUserDto } from './dto/users.dto';
import { InjectUpdatedBy } from '../../common/decorator/inject-updatedBy.decorator';

@UseGuards(JwtGuard, PermissionGuard)
@Controller('users')
export class UsersController {
  constructor(private userService: UsersService) {}

  @RequirePermissions(`${Resource.USER}:${Action.VIEW}`)
  @Get()
  async findAll(@Pagination() query: PaginationDto) {
    return this.userService.findAll(query);
  }

  @RequirePermissions(`${Resource.USER}:${Action.VIEW}`)
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.userService.findOne(+id);
  }

  @RequirePermissions(`${Resource.USER}:${Action.CREATE}`)
  @Post('create')
  async create(@InjectCreatedBy() payload: CreateUserDto) {
    return this.userService.create(payload);
  }

  @RequirePermissions(`${Resource.USER}:${Action.UPDATE}`)
  @Put(':id')
  async update(
    @Param('id') id: string,
    @InjectUpdatedBy() payload: UpdateUserDto,
  ) {
    return this.userService.update(+id, payload);
  }

  @RequirePermissions(`${Resource.USER}:${Action.DELETE}`)
  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.userService.delete(+id);
  }
}
