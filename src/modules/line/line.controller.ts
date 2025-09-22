import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  Query,
  Put
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { CreateLineDto } from './dto/create-line.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { LineService } from './line.service';
import { UpdateLineDto } from './dto/update-line.dto';

@ApiTags('lines')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('lines')
export class LineController {
  constructor(private readonly lineService: LineService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Create new line' })
  @ApiResponse({ status: 201, description: 'Line created successfully' })
  create(@Body() createLineDto: CreateLineDto) {
    return this.lineService.create(createLineDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all lines' })
  @ApiQuery({ name: 'factoryId', required: false, type: String })
  @ApiQuery({ name: 'includeTeams', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Lines retrieved successfully' })
  findAll(
    @Query('factoryId') factoryId?: string,
    @Query('includeTeams') includeTeams?: boolean
  ) {
    return this.lineService.findAll({ factoryId, includeTeams });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get line by ID' })
  @ApiResponse({ status: 200, description: 'Line retrieved successfully' })
  findOne(@Param('id') id: string) {
    return this.lineService.findOne(id);
  }

  @Get(':id/teams')
  @ApiOperation({ summary: 'Get teams of a line' })
  @ApiQuery({ name: 'includeGroups', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Line teams retrieved successfully' })
  getLineTeams(
    @Param('id') id: string,
    @Query('includeGroups') includeGroups?: boolean
  ) {
    return this.lineService.getLineTeams(id, { includeGroups });
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Update line' })
  @ApiResponse({ status: 200, description: 'Line updated successfully' })
  update(
    @Param('id') id: string,
    @Body() updateLineDto: UpdateLineDto
  ) {
    return this.lineService.update(id, updateLineDto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'Delete line' })
  @ApiResponse({ status: 200, description: 'Line deleted successfully' })
  remove(@Param('id') id: string) {
    return this.lineService.remove(id);
  }
}
