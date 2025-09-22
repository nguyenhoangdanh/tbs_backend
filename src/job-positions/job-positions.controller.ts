import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CreateJobPositionDto } from './dto/create-job-position.dto';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { JobPositionsService } from './job-positions.service';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UpdateJobPositionDto } from './dto/update-job-position.dto';

@ApiTags('job-positions')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('job-positions')
export class JobPositionsController {
  constructor(private readonly jobPositionsService: JobPositionsService) {}

  @Post()
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Create a new job position' })
  @ApiResponse({
    status: 201,
    description: 'Job position created successfully',
  })
  create(@Body() createJobPositionDto: CreateJobPositionDto) {
    return this.jobPositionsService.create(createJobPositionDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all job positions with filters' })
  @ApiResponse({
    status: 200,
    description: 'Job positions retrieved successfully',
  })
  findAll(
    @Query('departmentId') departmentId?: string,
    @Query('positionId') positionId?: string,
    @Query('isActive') isActive?: string,
  ) {
    return this.jobPositionsService.findAll({
      departmentId,
      positionId,
      isActive: isActive ? isActive === 'true' : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get job position by ID' })
  @ApiResponse({
    status: 200,
    description: 'Job position retrieved successfully',
  })
  findOne(@Param('id') id: string) {
    return this.jobPositionsService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Update job position' })
  @ApiResponse({
    status: 200,
    description: 'Job position updated successfully',
  })
  update(
    @Param('id') id: string,
    @Body() updateJobPositionDto: UpdateJobPositionDto,
  ) {
    return this.jobPositionsService.update(id, updateJobPositionDto);
  }

  @Delete(':id')
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'Delete job position' })
  @ApiResponse({
    status: 200,
    description: 'Job position deleted successfully',
  })
  remove(@Param('id') id: string) {
    return this.jobPositionsService.remove(id);
  }
}
