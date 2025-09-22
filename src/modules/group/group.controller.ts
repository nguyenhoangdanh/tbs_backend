import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  Query,
  Put,
  Patch
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { CreateGroupDto } from './dto/create-group.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { GroupService } from './group.service';
import { UpdateGroupDto } from './dto/update-group.dto';
import { AssignLeaderDto } from './dto/assign-leader.dto';
import { AddMemberDto } from './dto/add-member.dto';

@ApiTags('groups')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('groups')
export class GroupController {
  constructor(private readonly groupService: GroupService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Create new group' })
  @ApiResponse({ status: 201, description: 'Group created successfully' })
  create(@Body() createGroupDto: CreateGroupDto) {
    return this.groupService.create(createGroupDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all groups' })
  @ApiQuery({ name: 'teamId', required: false, type: String })
  @ApiQuery({ name: 'includeMembers', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Groups retrieved successfully' })
  findAll(
    @Query('teamId') teamId?: string,
    @Query('includeMembers') includeMembers?: boolean
  ) {
    return this.groupService.findAll({ teamId, includeMembers });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get group by ID' })
  @ApiResponse({ status: 200, description: 'Group retrieved successfully' })
  findOne(@Param('id') id: string) {
    return this.groupService.findOne(id);
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Update group' })
  @ApiResponse({ status: 200, description: 'Group updated successfully' })
  update(
    @Param('id') id: string,
    @Body() updateGroupDto: UpdateGroupDto
  ) {
    return this.groupService.update(id, updateGroupDto);
  }

  @Patch(':id/assign-leader')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Assign group leader' })
  @ApiResponse({ status: 200, description: 'Group leader assigned successfully' })
  assignLeader(
    @Param('id') id: string,
    @Body() assignLeaderDto: AssignLeaderDto
  ) {
    return this.groupService.assignLeader(id, assignLeaderDto.leaderId);
  }

  @Post(':id/members')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Add member to group' })
  @ApiResponse({ status: 200, description: 'Member added to group successfully' })
  addMember(
    @Param('id') id: string,
    @Body() addMemberDto: AddMemberDto
  ) {
    return this.groupService.addMember(id, addMemberDto.userId);
  }

  @Delete(':id/members/:userId')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Remove member from group' })
  @ApiResponse({ status: 200, description: 'Member removed from group successfully' })
  removeMember(
    @Param('id') id: string,
    @Param('userId') userId: string
  ) {
    return this.groupService.removeMember(id, userId);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'Delete group' })
  @ApiResponse({ status: 200, description: 'Group deleted successfully' })
  remove(@Param('id') id: string) {
    return this.groupService.remove(id);
  }
}
