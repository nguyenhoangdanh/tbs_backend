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
import { GroupService } from '../services/group.service'; // ⭐ ADD
import { CreateGroupDto } from '../dto/group/create-group.dto'; // ⭐ ADD
import { UpdateGroupDto } from '../dto/group/update-group.dto'; // ⭐ ADD
import { AssignLeaderDto } from '../dto/group/assign-leader.dto'; // ⭐ ADD
import { AddMemberDto } from '../dto/group/add-member.dto'; // ⭐ ADD
import { TransferGroupDto } from '../dto/group/transfer-group.dto'; // ⭐ ADD

@ApiTags('production/groups')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard) // ⭐ Use PermissionsGuard
@Controller('production/groups')
export class GroupController {
  constructor(private readonly groupService: GroupService) {}

  @Post()
  @RequirePermissions('groups:create')
  @ApiOperation({ summary: 'Create new group (SUPERADMIN/ADMIN only)' })
  @ApiResponse({ status: 201, description: 'Group created successfully' })
  create(@Body() createGroupDto: CreateGroupDto) {
    return this.groupService.create(createGroupDto);
  }

  @Get()
  @RequirePermissions('groups:view')
  @ApiOperation({ summary: 'Get all groups' })
  @ApiResponse({ status: 200, description: 'Groups retrieved successfully' })
  findAll(
    @Query('teamId') teamId?: string,
    @Query('includeMembers') includeMembers?: string,
  ) {
    return this.groupService.findAll({
      teamId,
      includeMembers: includeMembers === 'true',
    });
  }

  @Get(':id')
  @RequirePermissions('groups:view')
  @ApiOperation({ summary: 'Get group by ID' })
  @ApiResponse({ status: 200, description: 'Group retrieved successfully' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.groupService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('groups:update')
  @ApiOperation({ summary: 'Update group (SUPERADMIN/ADMIN only)' })
  @ApiResponse({ status: 200, description: 'Group updated successfully' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateGroupDto: UpdateGroupDto,
  ) {
    return this.groupService.update(id, updateGroupDto);
  }

  @Post(':id/assign-leader')
  @RequirePermissions('groups:assign')
  @ApiOperation({ summary: 'Assign leader to group (SUPERADMIN/ADMIN only)' })
  @ApiResponse({ status: 200, description: 'Leader assigned successfully' })
  assignLeader(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() assignLeaderDto: AssignLeaderDto,
  ) {
    return this.groupService.assignLeader(id, assignLeaderDto.leaderId);
  }

  @Post(':id/members')
  @RequirePermissions('groups:assign')
  @ApiOperation({ summary: 'Add member to group (SUPERADMIN/ADMIN only)' })
  @ApiResponse({ status: 201, description: 'Member added successfully' })
  addMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() addMemberDto: AddMemberDto,
  ) {
    return this.groupService.addMember(id, addMemberDto.userId);
  }

  @Delete(':id/members/:userId')
  @RequirePermissions('groups:assign')
  @ApiOperation({ summary: 'Remove member from group (SUPERADMIN/ADMIN only)' })
  @ApiResponse({ status: 200, description: 'Member removed successfully' })
  removeMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.groupService.removeMember(id, userId);
  }

  @Post(':id/transfer')
  @RequirePermissions('groups:manage')
  @ApiOperation({ summary: 'Transfer group to another team (SUPERADMIN only)' })
  @ApiResponse({ status: 200, description: 'Group transferred successfully' })
  transfer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() transferDto: TransferGroupDto,
  ) {
    return this.groupService.transferGroup(id, transferDto);
  }

  @Delete(':id')
  @RequirePermissions('groups:delete')
  @ApiOperation({ summary: 'Delete group (SUPERADMIN only)' })
  @ApiResponse({ status: 200, description: 'Group deleted successfully' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.groupService.remove(id);
  }
}
