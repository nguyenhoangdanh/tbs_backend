import {
  Controller, Get, Post, Put, Delete, Body, Param, Query,
  ParseUUIDPipe, DefaultValuePipe, ParseIntPipe,
} from '@nestjs/common';
import { PublicHolidayService } from '../services/public-holiday.service';
import { CreatePublicHolidayDto } from '../dto/public-holiday/create-public-holiday.dto';
import { GetUser } from 'src/common/decorators/get-user.decorator';
import { RequirePermissions } from 'src/common/decorators/permissions.decorator';

@Controller('public-holidays')
export class PublicHolidayController {
  constructor(private readonly publicHolidayService: PublicHolidayService) {}

  @Post()
  @RequirePermissions('public-holidays:create')
  create(@Body() dto: CreatePublicHolidayDto) {
    return this.publicHolidayService.create(dto);
  }

  @Get()
  @RequirePermissions('public-holidays:view')
  findAll(
    @GetUser('companyId') companyId: string,
    @Query('year', new DefaultValuePipe(new Date().getFullYear()), ParseIntPipe) year: number,
    @Query('companyId') queryCompanyId?: string,
  ) {
    return this.publicHolidayService.findAll(year, queryCompanyId ?? companyId);
  }

  @Get(':id')
  @RequirePermissions('public-holidays:view')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.publicHolidayService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('public-holidays:update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CreatePublicHolidayDto>,
  ) {
    return this.publicHolidayService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('public-holidays:delete')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.publicHolidayService.remove(id);
  }
}
