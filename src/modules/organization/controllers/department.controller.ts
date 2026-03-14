import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  HttpCode,
  HttpStatus,
  Patch,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { GetUser } from '../../../common/decorators/get-user.decorator';
import { User } from '@prisma/client';
import { DepartmentService } from '../services/department.service';
import { CreateDepartmentDto } from '../dto/department/create-department.dto';
import { UpdateDepartmentDto } from '../dto/department/update-department.dto';

@ApiTags('organization/departments')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@RequirePermissions('organizations:view')
@Controller('organization/departments')
export class DepartmentController {
  constructor(private readonly departmentService: DepartmentService) {}

  @Post()
  @Roles('ADMIN', 'SUPERADMIN')
  @RequirePermissions('organizations:manage')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create new department' })
  @ApiResponse({
    status: 201,
    description: 'Department created successfully',
  })
  create(@Body() createDepartmentDto: CreateDepartmentDto) {
    return this.departmentService.create(createDepartmentDto);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all departments' })
  @ApiResponse({
    status: 200,
    description: 'Departments retrieved successfully',
  })
  findAll(@GetUser() user: User) {
    // Role check handled by guard - filter by office for non-superadmin
    return this.departmentService.findByOffice(user.officeId);
  }

  @Get('by-office')
  @Roles('ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Get departments by office' })
  async findByOffice(@GetUser() user: any) {
    return this.departmentService.findByOffice(user.officeId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get department by ID' })
  @ApiResponse({
    status: 200,
    description: 'Department retrieved successfully',
  })
  findOne(@Param('id') id: string) {
    return this.departmentService.findOne(id);
  }

  @Get(':id/job-positions')
  @ApiOperation({ summary: 'Get job positions of a department' })
  @ApiResponse({
    status: 200,
    description: 'Job positions retrieved successfully',
  })
  getJobPositions(@Param('id') id: string) {
    return this.departmentService.getJobPositions(id);
  }

  @Patch(':id')
  @Roles('ADMIN', 'SUPERADMIN')
  @RequirePermissions('organizations:manage')
  @ApiOperation({ summary: 'Update department' })
  @ApiResponse({
    status: 200,
    description: 'Department updated successfully',
  })
  update(
    @Param('id') id: string,
    @Body() updateDepartmentDto: UpdateDepartmentDto,
  ) {
    return this.departmentService.update(id, updateDepartmentDto);
  }

  @Delete(':id')
  @Roles('SUPERADMIN')
  @RequirePermissions('organizations:manage')
  @ApiOperation({ summary: 'Delete department' })
  @ApiResponse({
    status: 200,
    description: 'Department deleted successfully',
  })
  remove(@Param('id') id: string) {
    return this.departmentService.remove(id);
  }
}
