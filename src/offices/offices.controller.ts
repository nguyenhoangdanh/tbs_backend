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
} from '@nestjs/common';
import { OfficesService } from './offices.service';
import { CreateOfficeDto } from './dto/create-office.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';

@Controller('offices')
@UseGuards(JwtAuthGuard, RolesGuard)
@RequirePermissions('organizations:view')
export class OfficesController {
  constructor(private officesService: OfficesService) {}

  @Post()
  @Roles('SUPERADMIN')
  @RequirePermissions('organizations:manage')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createOfficeDto: CreateOfficeDto) {
    return this.officesService.create(createOfficeDto);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  findAll() {
    return this.officesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get office by ID' })
  @ApiResponse({ status: 200, description: 'Office retrieved successfully' })
  findOne(@Param('id') id: string) {
    return this.officesService.findOne(id);
  }

  @Delete(':id')
  @Roles('SUPERADMIN')
  @RequirePermissions('organizations:manage')
  @ApiOperation({ summary: 'Delete office' })
  @ApiResponse({ status: 200, description: 'Office deleted successfully' })
  remove(@Param('id') id: string) {
    return this.officesService.remove(id);
  }
}
