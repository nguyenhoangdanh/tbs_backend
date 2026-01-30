import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { GetUser } from '../common/decorators/get-user.decorator';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@ApiTags('users')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ========== PROFILE ROUTES (MUST BE BEFORE :id ROUTE) ==========

  @Get('profile')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'Profile retrieved successfully' })
  async getProfile(@GetUser() user: any) {
    return this.usersService.getUserById(user.id);
  }

  @Put('profile')
  @ApiOperation({ summary: 'Update current user profile' })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  async updateProfile(
    @GetUser() user: any,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    // User can only update their own basic info
    // Cannot change role, office, jobPosition without admin permission
    const allowedFields: UpdateProfileDto = {
      firstName: updateProfileDto.firstName,
      lastName: updateProfileDto.lastName,
      phone: updateProfileDto.phone,
      email: updateProfileDto.email,
      dateOfBirth: updateProfileDto.dateOfBirth,
      address: updateProfileDto.address,
      sex: updateProfileDto.sex,
    };

    return this.usersService.updateUser(user.id, allowedFields, user);
  }

  @Put('profile/password')
  @ApiOperation({ summary: 'Change current user password' })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  async changePassword(
    @GetUser() user: any,
    @Body() dto: { currentPassword: string; newPassword: string },
  ) {
    return this.usersService.changePassword(user.id, dto);
  }

  @Post('avatar')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload avatar for current user' })
  @ApiResponse({ 
    status: 200, 
    description: 'Avatar uploaded successfully',
    schema: {
      type: 'object',
      properties: {
        avatarUrl: { type: 'string' }
      }
    }
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  async uploadAvatar(
    @GetUser() user: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    return this.usersService.uploadAvatar(user.id, user.employeeCode, file);
  }

  @Delete('avatar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove avatar for current user' })
  @ApiResponse({ status: 200, description: 'Avatar removed successfully' })
  async removeAvatar(@GetUser() user: any) {
    return this.usersService.removeAvatar(user.id);
  }

  // ========== LOOKUP ROUTES (BEFORE :id) ==========

  @Get('offices')
  @RequirePermissions('users:view')
  @ApiOperation({ summary: 'Get all offices' })
  async getOffices() {
    return this.usersService.getOffices();
  }

  @Get('departments')
  @RequirePermissions('users:view')
  @ApiOperation({ summary: 'Get all departments' })
  async getDepartments(@Query('officeId') officeId?: string) {
    return this.usersService.getDepartments(officeId);
  }

  @Get('positions')
  @RequirePermissions('users:view')
  @ApiOperation({ summary: 'Get all positions' })
  async getPositions() {
    return this.usersService.getPositions();
  }

  @Get('job-positions')
  @RequirePermissions('users:view')
  @ApiOperation({ summary: 'Get all job positions' })
  async getJobPositions(
    @Query('officeId') officeId?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.usersService.getJobPositions({ officeId, departmentId });
  }

  // ⭐ NEW: Search by employee code
  @Get('search-by-employee-code/:code')
  @RequirePermissions('users:view')
  @ApiOperation({ summary: 'Search user by employee code' })
  @ApiResponse({ status: 200, description: 'User found successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async searchByEmployeeCode(@Param('code') code: string) {
    return this.usersService.searchByEmployeeCode(code);
  }

  // ========== USER CRUD ==========

  @Get()
  @RequirePermissions('users:view')
  @ApiOperation({ summary: 'Get all users with pagination and filters' })
  @ApiResponse({ status: 200, description: 'Users retrieved successfully' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'officeId', required: false, type: String })
  @ApiQuery({ name: 'departmentId', required: false, type: String })
  @ApiQuery({ name: 'role', required: false, type: String, description: 'Filter by role code' })
  @ApiQuery({ name: 'isActive', required: false, type: String })
  async getAllUsers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('officeId') officeId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('role') role?: string,
    @Query('isActive') isActive?: string,
  ) {
    return this.usersService.getAllUsers({
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 10,
      search,
      officeId,
      departmentId,
      role,
      isActive:
        isActive === 'true' ? true : isActive === 'false' ? false : undefined,
    });
  }

  // ⭐ IMPORTANT: :id route MUST BE LAST among GET routes
  @Get(':id')
  @RequirePermissions('users:view')
  @ApiOperation({ summary: 'Get user by ID' })
  async getUserById(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.getUserById(id);
  }

  @Post()
  @Roles('SUPERADMIN', 'ADMIN')
  @RequirePermissions('users:create')
  @ApiOperation({ summary: 'Create new user (SUPERADMIN/ADMIN)' })
  @ApiResponse({ status: 201, description: 'User created successfully' })
  async createUser(@Body() createUserDto: CreateUserDto) {
    return this.usersService.createUser(createUserDto);
  }

  @Put(':id')
  @RequirePermissions('users:update')
  @ApiOperation({ summary: 'Update user' })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  async updateUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateProfileDto: UpdateProfileDto,
    @GetUser() currentUser: any,
  ) {
    // Check if user can update this profile
    const isSelfUpdate = currentUser.id === id;
    const canUpdateOthers = ['SUPERADMIN', 'ADMIN'].includes(currentUser.role);

    if (!isSelfUpdate && !canUpdateOthers) {
      throw new BadRequestException('You can only update your own profile');
    }

    return this.usersService.updateUser(id, updateProfileDto, currentUser);
  }

  @Delete(':id')
  @Roles('SUPERADMIN')
  @RequirePermissions('users:delete')
  @ApiOperation({ summary: 'Delete user (SUPERADMIN only)' })
  @ApiResponse({ status: 200, description: 'User deleted successfully' })
  async deleteUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.deleteUser(id);
  }

  @Put(':id/toggle-active')
  @Roles('SUPERADMIN', 'ADMIN')
  @RequirePermissions('users:update')
  @ApiOperation({ summary: 'Toggle user active status (SUPERADMIN/ADMIN)' })
  async toggleUserActive(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.toggleUserActive(id);
  }

  @Put(':id/reset-password')
  @Roles('SUPERADMIN', 'ADMIN')
  @RequirePermissions('users:update')
  @ApiOperation({
    summary: 'Reset user password to default (SUPERADMIN/ADMIN)',
  })
  async resetPassword(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.resetPassword(id);
  }

  // ========== BULK IMPORT FROM EXCEL ==========

  @Get('import-template')
  @Roles('SUPERADMIN', 'ADMIN')
  @RequirePermissions('users:view')
  @ApiOperation({ summary: 'Download Excel import template (12-column format)' })
  @ApiResponse({ 
    status: 200, 
    description: 'Template downloaded successfully',
    content: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  async getImportTemplate(@Res() res: Response) {
    const { buffer, filename, contentType } = await this.usersService.getImportTemplate();
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Post('bulk-create')
  @Roles('SUPERADMIN')
  @RequirePermissions('users:create')
  @ApiOperation({ summary: 'Bulk create users (SUPERADMIN only)' })
  @ApiResponse({ status: 201, description: 'Users created successfully' })
  async bulkCreateUsers(@Body() dto: { users: CreateUserDto[] }) {
    return this.usersService.bulkCreateUsers(dto.users);
  }

  @Post('import-excel')
  @Roles('SUPERADMIN')
  @RequirePermissions('users:create')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Import users from Excel file (12-column format, SUPERADMIN only)' })
  @ApiResponse({ status: 201, description: 'Users imported successfully' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  async importUsersFromExcel(@UploadedFile() file: any) {
    // ⭐ FIX: Change to `any`
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    if (!file.originalname.match(/\.(xlsx|xls)$/)) {
      throw new BadRequestException('Only Excel files are allowed');
    }

    return this.usersService.importUsersFromExcel(file);
  }
}
