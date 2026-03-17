import {
  Controller, Get, Post, Put, Delete, Body, Param,
  Query, UseGuards, HttpCode, HttpStatus, ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { BusinessSectorsService } from './business-sectors.service';
import { CreateBusinessSectorDto, UpdateBusinessSectorDto } from './dto/business-sector.dto';

@ApiTags('business-sectors')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@RequirePermissions('business-sectors:view')
@Controller('business-sectors')
export class BusinessSectorsController {
  constructor(private readonly service: BusinessSectorsService) {}

  @Get()
  @ApiOperation({ summary: 'List all business sectors' })
  @ApiQuery({ name: 'onlyActive', required: false, type: Boolean })
  findAll(@Query('onlyActive') onlyActive?: string) {
    return this.service.findAll(onlyActive === 'true');
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @Roles('SUPERADMIN', 'ADMIN')
  @RequirePermissions('business-sectors:manage')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateBusinessSectorDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  @Roles('SUPERADMIN', 'ADMIN')
  @RequirePermissions('business-sectors:manage')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBusinessSectorDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles('SUPERADMIN')
  @RequirePermissions('business-sectors:manage')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
