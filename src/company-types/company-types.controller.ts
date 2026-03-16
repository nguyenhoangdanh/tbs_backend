import {
  Controller, Get, Post, Put, Delete, Body, Param,
  Query, UseGuards, HttpCode, HttpStatus, ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CompanyTypesService } from './company-types.service';
import { CreateCompanyTypeDto, UpdateCompanyTypeDto } from './dto/company-type.dto';

@ApiTags('company-types')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@RequirePermissions('company-types:view')
@Controller('company-types')
export class CompanyTypesController {
  constructor(private readonly service: CompanyTypesService) {}

  @Get()
  @ApiOperation({ summary: 'List all company types ordered by level' })
  @ApiQuery({ name: 'onlyActive', required: false, type: Boolean })
  findAll(@Query('onlyActive') onlyActive?: string) {
    return this.service.findAll(onlyActive === 'true');
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get company type by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @Roles('SUPERADMIN', 'ADMIN')
  @RequirePermissions('company-types:manage')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create company type' })
  create(@Body() dto: CreateCompanyTypeDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  @Roles('SUPERADMIN', 'ADMIN')
  @RequirePermissions('company-types:manage')
  @ApiOperation({ summary: 'Update company type' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCompanyTypeDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles('SUPERADMIN')
  @RequirePermissions('company-types:manage')
  @ApiOperation({ summary: 'Delete company type (must have no companies)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
