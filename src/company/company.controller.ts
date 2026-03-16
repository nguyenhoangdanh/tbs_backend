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
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CompanyService } from './company.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

@ApiTags('companies')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@RequirePermissions('companies:view')
@Controller('companies')
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  @Post()
  @Roles('SUPERADMIN', 'ADMIN')
  @RequirePermissions('companies:manage')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create new company (SUPERADMIN/ADMIN)' })
  @ApiResponse({ status: 201, description: 'Company created successfully' })
  create(@Body() dto: CreateCompanyDto) {
    return this.companyService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all companies with optional filters' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'typeId', required: false, description: 'CompanyType ID' })
  @ApiQuery({ name: 'sectorId', required: false, description: 'BusinessSector ID' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiQuery({ name: 'parentCompanyId', required: false, description: 'null for top-level only' })
  findAll(
    @Query('search') search?: string,
    @Query('typeId') typeId?: string,
    @Query('sectorId') sectorId?: string,
    @Query('isActive') isActive?: string,
    @Query('parentCompanyId') parentCompanyId?: string,
  ) {
    return this.companyService.findAll({
      search,
      typeId,
      sectorId,
      isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
      parentCompanyId,
    });
  }

  @Get('tree')
  @ApiOperation({ summary: 'Get company hierarchy tree (root → children)' })
  findTree() {
    return this.companyService.findTree();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get company by ID with offices and children' })
  @ApiResponse({ status: 404, description: 'Company not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.companyService.findOne(id);
  }

  @Put(':id')
  @Roles('SUPERADMIN', 'ADMIN')
  @RequirePermissions('companies:manage')
  @ApiOperation({ summary: 'Update company' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCompanyDto) {
    return this.companyService.update(id, dto);
  }

  @Delete(':id')
  @Roles('SUPERADMIN')
  @RequirePermissions('companies:manage')
  @ApiOperation({ summary: 'Delete company (SUPERADMIN only)' })
  @ApiResponse({ status: 409, description: 'Company has children, offices, or users' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.companyService.remove(id);
  }
}
