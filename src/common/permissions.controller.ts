import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PermissionsService } from './permissions.service';
import {
  CreatePermissionDto,
  UpdatePermissionDto,
  BulkCreatePermissionsDto,
  BulkDeletePermissionsDto,
} from './dto/permission.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';

@ApiTags('Permissions Management')
@Controller('permissions')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  @Roles('SUPERADMIN', 'ADMIN')
  @ApiOperation({ summary: 'Get all permissions' })
  async getAllPermissions() {
    return this.permissionsService.getAllPermissions();
  }

  @Get(':id')
  @Roles('SUPERADMIN', 'ADMIN')
  @ApiOperation({ summary: 'Get permission by ID' })
  async getPermissionById(@Param('id') id: string) {
    return this.permissionsService.getPermissionById(id);
  }

  @Post('seed')
  @Roles('SUPERADMIN')
  @ApiOperation({ summary: 'Seed default permissions' })
  async seedPermissions() {
    return this.permissionsService.seedPermissions();
  }

  @Post()
  @Roles('SUPERADMIN')
  @ApiOperation({ summary: 'Create new permission' })
  async createPermission(@Body() dto: CreatePermissionDto) {
    return this.permissionsService.createPermission(dto);
  }

  @Post('bulk')
  @Roles('SUPERADMIN')
  @ApiOperation({ summary: 'Bulk create permissions (skips duplicates)' })
  async bulkCreatePermissions(@Body() dto: BulkCreatePermissionsDto) {
    return this.permissionsService.bulkCreatePermissions(dto.permissions);
  }

  @Put(':id')
  @Roles('SUPERADMIN')
  @ApiOperation({ summary: 'Update permission' })
  async updatePermission(
    @Param('id') id: string,
    @Body() dto: UpdatePermissionDto,
  ) {
    return this.permissionsService.updatePermission(id, dto);
  }

  @Delete('all')
  @Roles('SUPERADMIN')
  @ApiOperation({ summary: 'Delete ALL permissions (destructive)' })
  async deleteAllPermissions() {
    return this.permissionsService.deleteAllPermissions();
  }

  @Delete('bulk')
  @Roles('SUPERADMIN')
  @ApiOperation({ summary: 'Bulk delete permissions by IDs' })
  async bulkDeletePermissions(@Body() dto: BulkDeletePermissionsDto) {
    return this.permissionsService.bulkDeletePermissions(dto.ids);
  }

  @Post('bulk-delete')
  @Roles('SUPERADMIN')
  @ApiOperation({ summary: 'Bulk delete permissions by IDs (POST variant for body support)' })
  async bulkDeletePermissionsPost(@Body() dto: BulkDeletePermissionsDto) {
    return this.permissionsService.bulkDeletePermissions(dto.ids);
  }

  @Delete(':id')
  @Roles('SUPERADMIN')
  @ApiOperation({ summary: 'Delete permission' })
  async deletePermission(@Param('id') id: string) {
    return this.permissionsService.deletePermission(id);
  }
}
