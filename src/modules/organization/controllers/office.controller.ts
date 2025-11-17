import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Put,
  UseGuards,
  HttpCode,
  HttpStatus,
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
import { Role } from '@prisma/client';
import { OfficeService } from '../services/office.service';
import { CreateOfficeDto } from '../dto/office/create-office.dto';
import { UpdateOfficeDto } from '../dto/office/update-office.dto';

@ApiTags('organization/offices')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('organization/offices')
export class OfficeController {
  constructor(private readonly officeService: OfficeService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.SUPERADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create new office' })
  @ApiResponse({ status: 201, description: 'Office created successfully' })
  create(@Body() createOfficeDto: CreateOfficeDto) {
    return this.officeService.create(createOfficeDto);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all offices' })
  @ApiResponse({ status: 200, description: 'Offices retrieved successfully' })
  findAll() {
    return this.officeService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get office by ID' })
  @ApiResponse({ status: 200, description: 'Office retrieved successfully' })
  findOne(@Param('id') id: string) {
    return this.officeService.findOne(id);
  }

  @Get(':id/departments')
  @ApiOperation({ summary: 'Get departments of an office' })
  @ApiResponse({
    status: 200,
    description: 'Departments retrieved successfully',
  })
  getDepartments(@Param('id') id: string) {
    return this.officeService.getDepartments(id);
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'Update office' })
  @ApiResponse({ status: 200, description: 'Office updated successfully' })
  update(@Param('id') id: string, @Body() updateOfficeDto: UpdateOfficeDto) {
    return this.officeService.update(id, updateOfficeDto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'Delete office' })
  @ApiResponse({ status: 200, description: 'Office deleted successfully' })
  remove(@Param('id') id: string) {
    return this.officeService.remove(id);
  }
}
