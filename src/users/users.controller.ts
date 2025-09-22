import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Param,
  Query,
  Post,
  Delete,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { GetUser } from '../common/decorators/get-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { ApiOperation, ApiResponse, ApiTags, ApiQuery, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { getCurrentWorkWeek } from '../common/utils/week-utils';
interface UploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}
@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('profile')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'Profile retrieved successfully' })
  async getProfile(@GetUser() user: any) {
    return this.usersService.getProfile(user.id);
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update current user profile' })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  async updateProfile(
    @GetUser() user: any,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(
      user.id,
      updateProfileDto,
      user.role,
    );
  }

  @Patch(':userId')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({ summary: 'Update user by admin (partial update)' })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  async updateUserByAdmin(
    @GetUser() adminUser: any,
    @Param('userId') userId: string,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    return this.usersService.updateUserByAdmin(
      adminUser.id,
      userId,
      updateProfileDto,
      adminUser.role,
    );
  }

  @Get('by-office')
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Get users by current user office' })
  async getUsersByOffice(@GetUser() user: any) {
    return this.usersService.getUsersByOffice(user.officeId);
  }

  @Get('by-department/:departmentId')
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Get users by department' })
  async getUsersByDepartment(@Param('departmentId') departmentId: string) {
    return this.usersService.getUsersByDepartment(departmentId);
  }

  @Get('all')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all users (superadmin only)' })
  async getAllUsers() {
    return this.usersService.getAllUsers();
  }

  @Get('with-ranking')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({ summary: 'Get users with ranking data' })
  @ApiQuery({
    name: 'weekNumber',
    required: false,
    description: 'Filter by week number',
  })
  @ApiQuery({ name: 'year', required: false, description: 'Filter by year' })
  @ApiQuery({
    name: 'periodWeeks',
    required: false,
    description: 'Number of weeks for analysis',
  })
  async getUsersWithRankingData(
    @Query('weekNumber') weekNumber?: string,
    @Query('year') year?: string,
    @Query('periodWeeks') periodWeeks?: string,
  ) {
    const filters: any = {};

    if (weekNumber || year || periodWeeks) {
      const { weekNumber: currentWeek, year: currentYear } = getCurrentWorkWeek();
      const targetWeek = parseInt(weekNumber) || currentWeek;
      const targetYear = parseInt(year) || currentYear;
      const weeks = parseInt(periodWeeks) || 4;

      // Generate week ranges for report filtering
      const weekRanges = [];
      for (let i = 0; i < weeks; i++) {
        let week = targetWeek - i;
        let reportYear = targetYear;

        if (week <= 0) {
          week = 52 + week;
          reportYear = targetYear - 1;
        }

        weekRanges.push({ weekNumber: week, year: reportYear });
      }

      filters.reportFilters = {
        OR: weekRanges.map(({ weekNumber, year }) => ({ weekNumber, year })),
      };
    }

    return this.usersService.getUsersWithRankingData(filters);
  }

  @Post('avatar')
  @ApiOperation({ summary: 'Upload user avatar' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Avatar image file',
    type: 'multipart/form-data',
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Image file (JPEG, PNG, WEBP, max 5MB)',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Avatar uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid file or file too large' })
  @UseInterceptors(FileInterceptor('file', {
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB limit
    },
    fileFilter: (req, file, callback) => {
      const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      if (allowedMimeTypes.includes(file.mimetype)) {
        callback(null, true);
      } else {
        callback(new BadRequestException('Only JPEG, PNG, and WEBP images are allowed'), false);
      }
    },
  }))
  async uploadAvatar(
    @GetUser() user: any,
    @UploadedFile() file: UploadedFile,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    return this.usersService.uploadAvatar(user.id, file);
  }

  @Delete('avatar')
  @ApiOperation({ summary: 'Delete user avatar' })
  @ApiResponse({ status: 200, description: 'Avatar deleted successfully' })
  @ApiResponse({ status: 404, description: 'User not found or no avatar to delete' })
  async deleteAvatar(@GetUser() user: any) {
    return this.usersService.deleteAvatar(user.id);
  }

  @Get('search-by-employee-code/:employeeCode')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({ summary: 'Search user by employee code for adding to group' })
  @ApiResponse({ status: 200, description: 'User found successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async searchByEmployeeCode(@Param('employeeCode') employeeCode: string) {
    return this.usersService.searchByEmployeeCode(employeeCode);
  }

  @Get('group-members/:groupId')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({ summary: 'Get current members of a group' })
  @ApiResponse({ status: 200, description: 'Group members retrieved successfully' })
  async getGroupMembers(@Param('groupId') groupId: string) {
    return this.usersService.getGroupMembers(groupId);
  }

  @Get('available-leaders/:groupId')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({ summary: 'Get available users who can be group leaders' })
  @ApiResponse({ status: 200, description: 'Available leaders retrieved successfully' })
  async getAvailableLeaders(@Param('groupId') groupId: string) {
    return this.usersService.getAvailableLeaders(groupId);
  }
}
