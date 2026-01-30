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
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { JobPositionService } from '../services/job-position.service';
import { CreateJobPositionDto } from '../dto/job-position/create-job-position.dto';
import { UpdateJobPositionDto } from '../dto/job-position/update-job-position.dto';

@ApiTags('organization/job-positions')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('organization/job-positions')
export class JobPositionController {
  constructor(private readonly jobPositionService: JobPositionService) {}

  @Post()
  @Roles('SUPERADMIN', 'ADMIN')
  @ApiOperation({ summary: 'Create a new job position' })
  @ApiResponse({
    status: 201,
    description: 'Job position created successfully',
  })
  create(@Body() createJobPositionDto: CreateJobPositionDto) {
    return this.jobPositionService.create(createJobPositionDto);
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
    return this.jobPositionService.findAll({
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
    return this.jobPositionService.findOne(id);
  }

  @Patch(':id')
  @Roles('SUPERADMIN', 'ADMIN')
  @ApiOperation({ summary: 'Update job position' })
  @ApiResponse({
    status: 200,
    description: 'Job position updated successfully',
  })
  update(
    @Param('id') id: string,
    @Body() updateJobPositionDto: UpdateJobPositionDto,
  ) {
    return this.jobPositionService.update(id, updateJobPositionDto);
  }

  @Delete(':id')
  @Roles('SUPERADMIN')
  @ApiOperation({ summary: 'Delete job position' })
  @ApiResponse({
    status: 200,
    description: 'Job position deleted successfully',
  })
  remove(@Param('id') id: string) {
    return this.jobPositionService.remove(id);
  }
}
