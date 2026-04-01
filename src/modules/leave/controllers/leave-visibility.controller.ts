import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, ParseUUIDPipe,
} from '@nestjs/common';
import { LeaveVisibilityService } from '../services/leave-visibility.service';
import { CreateVisibilityRuleDto } from '../dto/leave-visibility/create-visibility-rule.dto';
import { GetUser } from 'src/common/decorators/get-user.decorator';
import { RequirePermissions } from 'src/common/decorators/permissions.decorator';

@Controller('leave-visibility')
export class LeaveVisibilityController {
  constructor(private readonly visibilityService: LeaveVisibilityService) {}

  @Post()
  @RequirePermissions('leave-visibility:create')
  create(@Body() dto: CreateVisibilityRuleDto) {
    return this.visibilityService.create(dto);
  }

  @Get()
  @RequirePermissions('leave-visibility:view')
  findAll(
    @GetUser('companyId') companyId: string,
    @Query('companyId') queryCompanyId?: string,
  ) {
    return this.visibilityService.findAll(queryCompanyId ?? companyId);
  }

  @Get(':id')
  @RequirePermissions('leave-visibility:view')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.visibilityService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('leave-visibility:update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CreateVisibilityRuleDto>,
  ) {
    return this.visibilityService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('leave-visibility:delete')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.visibilityService.remove(id);
  }
}
