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
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { TeamService } from '../services/team.service';
import { CreateTeamDto } from '../dto/team/create-team.dto';
import { UpdateTeamDto } from '../dto/team/update-team.dto';
import { TransferTeamDto } from '../dto/team/transfer-team.dto';

@ApiTags('production/teams')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard) // ⭐ Use PermissionsGuard
@Controller('production/teams')
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  @Post()
  @RequirePermissions('teams:create')
  @ApiOperation({ summary: 'Create new team (SUPERADMIN/ADMIN only)' })
  @ApiResponse({ status: 201, description: 'Team created successfully' })
  create(@Body() createTeamDto: CreateTeamDto) {
    return this.teamService.create(createTeamDto);
  }

  @Get()
  @RequirePermissions('teams:view')
  @ApiOperation({ summary: 'Get all teams' })
  @ApiResponse({ status: 200, description: 'Teams retrieved successfully' })
  findAll(
    @Query('lineId') lineId?: string,
    @Query('includeGroups') includeGroups?: string,
  ) {
    return this.teamService.findAll({
      lineId,
      includeGroups: includeGroups === 'true',
    });
  }

  @Get(':id')
  @RequirePermissions('teams:view')
  @ApiOperation({ summary: 'Get team by ID' })
  @ApiResponse({ status: 200, description: 'Team retrieved successfully' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.teamService.findOne(id);
  }

  @Get(':id/groups')
  @RequirePermissions('teams:view')
  @ApiOperation({ summary: 'Get groups of a team' })
  @ApiResponse({ status: 200, description: 'Groups retrieved successfully' })
  getGroups(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('includeMembers') includeMembers?: string,
  ) {
    return this.teamService.getTeamGroups(id, {
      includeMembers: includeMembers === 'true',
    });
  }

  @Put(':id')
  @RequirePermissions('teams:update')
  @ApiOperation({ summary: 'Update team (SUPERADMIN/ADMIN only)' })
  @ApiResponse({ status: 200, description: 'Team updated successfully' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateTeamDto: UpdateTeamDto,
  ) {
    return this.teamService.update(id, updateTeamDto);
  }

  @Post(':id/transfer')
  @RequirePermissions('teams:manage')
  @ApiOperation({ summary: 'Transfer team to another line (SUPERADMIN only)' })
  @ApiResponse({ status: 200, description: 'Team transferred successfully' })
  transfer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() transferDto: TransferTeamDto,
  ) {
    return this.teamService.transferTeam(id, transferDto);
  }

  @Delete(':id')
  @RequirePermissions('teams:delete')
  @ApiOperation({ summary: 'Delete team (SUPERADMIN only)' })
  @ApiResponse({ status: 200, description: 'Team deleted successfully' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.teamService.remove(id);
  }
}
