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
import { PositionsService } from './positions.service';
import { CreatePositionDto } from './dto/create-position.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';

@Controller('positions')
@UseGuards(JwtAuthGuard, RolesGuard)
@RequirePermissions('organizations:view')
export class PositionsController {
  constructor(private positionsService: PositionsService) {}

  @Post()
  @Roles('ADMIN', 'SUPERADMIN')
  @RequirePermissions('organizations:manage')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createPositionDto: CreatePositionDto) {
    return this.positionsService.create(createPositionDto);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  findAll() {
    return this.positionsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get position by ID' })
  @ApiResponse({ status: 200, description: 'Position retrieved successfully' })
  findOne(@Param('id') id: string) {
    return this.positionsService.findOne(id);
  }

  @Delete(':id')
  @Roles('SUPERADMIN')
  @RequirePermissions('organizations:manage')
  @ApiOperation({ summary: 'Delete position' })
  @ApiResponse({ status: 200, description: 'Position deleted successfully' })
  remove(@Param('id') id: string) {
    return this.positionsService.remove(id);
  }
}
