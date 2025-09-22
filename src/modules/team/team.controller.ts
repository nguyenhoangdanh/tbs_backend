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
import { CreateTeamDto } from './dto/create-team.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { TeamService } from './team.service';
import { UpdateTeamDto } from './dto/update-team.dto';

@ApiTags('teams')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('teams')
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Create new team' })
  @ApiResponse({ status: 201, description: 'Team created successfully' })
  create(@Body() createTeamDto: CreateTeamDto) {
    return this.teamService.create(createTeamDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all teams' })
  @ApiQuery({ name: 'lineId', required: false, type: String })
  @ApiQuery({ name: 'includeGroups', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Teams retrieved successfully' })
  findAll(
    @Query('lineId') lineId?: string,
    @Query('includeGroups') includeGroups?: boolean
  ) {
    return this.teamService.findAll({ lineId, includeGroups });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get team by ID' })
  @ApiResponse({ status: 200, description: 'Team retrieved successfully' })
  findOne(@Param('id') id: string) {
    return this.teamService.findOne(id);
  }

  @Get(':id/groups')
  @ApiOperation({ summary: 'Get groups of a team' })
  @ApiQuery({ name: 'includeMembers', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Team groups retrieved successfully' })
  getTeamGroups(
    @Param('id') id: string,
    @Query('includeMembers') includeMembers?: boolean
  ) {
    return this.teamService.getTeamGroups(id, { includeMembers });
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Update team' })
  @ApiResponse({ status: 200, description: 'Team updated successfully' })
  update(
    @Param('id') id: string,
    @Body() updateTeamDto: UpdateTeamDto
  ) {
    return this.teamService.update(id, updateTeamDto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'Delete team' })
  @ApiResponse({ status: 200, description: 'Team deleted successfully' })
  remove(@Param('id') id: string) {
    return this.teamService.remove(id);
  }
}
