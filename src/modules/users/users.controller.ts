import { Resource, Action } from './../../common/enums/resource.enum';
import {
  Controller,
  Get,
  UseGuards,
  Param,
  Post,
  Put,
  Delete,
  Request,
  Body,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtGuard } from '../auth/guards/auth.guard';
import { Pagination } from '../../common/decorator/pagination.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermissions } from '../../common/decorator/permission.decorator';
import { InjectCreatedBy } from '../../common/decorator/inject-createdBy.decorator';
import { CreateUserDto, UpdateUserDto } from './dto/users.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { InjectUpdatedBy } from '../../common/decorator/inject-updatedBy.decorator';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtGuard, PermissionGuard)
@Controller('users')
export class UsersController {
  constructor(private userService: UsersService) {}

  @RequirePermissions(`${Resource.USER}:${Action.VIEW}`)
  @Get()
  async findAll(@Pagination() query: PaginationDto) {
    return this.userService.findAll(query);
  }

  /**
   * Change password for current user
   * ⚠️ IMPORTANT: This route MUST be defined BEFORE :id routes to avoid conflict
   * No permission required - users can change their own password
   */
  @ApiOperation({ summary: 'Ubah kata sandi pengguna yang sedang login' })
  @Put('change-password')
  async changePassword(
    @Request() req: { user: { id: number } },
    @Body() payload: ChangePasswordDto,
  ) {
    return this.userService.changePassword(req.user.id, payload);
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
