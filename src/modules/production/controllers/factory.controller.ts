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
import { FactoryService } from '../services/factory.service';
import { CreateFactoryDto } from '../dto/factory/create-factory.dto';
import { UpdateFactoryDto } from '../dto/factory/update-factory.dto';

@ApiTags('production/factories')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard) // ⭐ Use PermissionsGuard
@Controller('production/factories')
export class FactoryController {
  constructor(private readonly factoryService: FactoryService) {}

  @Post()
  @RequirePermissions('factories:create') // ⭐ Require permission
  @ApiOperation({ summary: 'Create new factory' })
  @ApiResponse({ status: 201, description: 'Factory created successfully' })
  create(@Body() createFactoryDto: CreateFactoryDto) {
    return this.factoryService.create(createFactoryDto);
  }

  @Get()
  @RequirePermissions('factories:view') // ⭐ Require permission
  @ApiOperation({ summary: 'Get all factories' })
  @ApiResponse({ status: 200, description: 'Factories retrieved successfully' })
  findAll(@Query('includeLines') includeLines?: string) {
    return this.factoryService.findAll({
      includeLines: includeLines === 'true',
    });
  }

  @Get(':id')
  @RequirePermissions('factories:view') // ⭐ Require permission
  @ApiOperation({ summary: 'Get factory by ID' })
  @ApiResponse({ status: 200, description: 'Factory retrieved successfully' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.factoryService.findOne(id);
  }

  @Get(':id/structure')
  @RequirePermissions('factories:view') // ⭐ Require permission
  @ApiOperation({ summary: 'Get complete factory structure' })
  @ApiResponse({ status: 200, description: 'Structure retrieved successfully' })
  getStructure(@Param('id', ParseUUIDPipe) id: string) {
    return this.factoryService.getFactoryStructure(id);
  }

  @Get(':id/lines')
  @RequirePermissions('factories:view') // ⭐ Require permission
  @ApiOperation({ summary: 'Get lines of a factory' })
  @ApiResponse({ status: 200, description: 'Lines retrieved successfully' })
  getLines(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('includeTeams') includeTeams?: string,
  ) {
    return this.factoryService.getFactoryLines(id, {
      includeTeams: includeTeams === 'true',
    });
  }

  @Put(':id')
  @RequirePermissions('factories:update') // ⭐ Require permission
  @ApiOperation({ summary: 'Update factory' })
  @ApiResponse({ status: 200, description: 'Factory updated successfully' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateFactoryDto: UpdateFactoryDto,
  ) {
    return this.factoryService.update(id, updateFactoryDto);
  }

  @Delete(':id')
  @RequirePermissions('factories:delete') // ⭐ Require permission
  @ApiOperation({ summary: 'Delete factory' })
  @ApiResponse({ status: 200, description: 'Factory deleted successfully' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.factoryService.remove(id);
  }
}
