import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  Query,
  Put
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { CreateFactoryDto } from './dto/create-factory.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Role } from '@prisma/client';
import { FactoryService } from './factory.service';
import { UpdateFactoryDto } from './dto/update-factory.dto';

@ApiTags('factories')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('factories')
export class FactoryController {
  constructor(private readonly factoryService: FactoryService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Create new factory' })
  @ApiResponse({ status: 201, description: 'Factory created successfully' })
  create(@Body() createFactoryDto: CreateFactoryDto, @GetUser() user: any) {
    return this.factoryService.create(createFactoryDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all factories' })
  @ApiQuery({ name: 'includeLines', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Factories retrieved successfully' })
  findAll(@Query('includeLines') includeLines?: boolean) {
    return this.factoryService.findAll({ includeLines });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get factory by ID' })
  @ApiResponse({ status: 200, description: 'Factory retrieved successfully' })
  findOne(@Param('id') id: string) {
    return this.factoryService.findOne(id);
  }

  @Get(':id/structure')
  @ApiOperation({ summary: 'Get complete factory structure (lines, teams, groups)' })
  @ApiResponse({ status: 200, description: 'Factory structure retrieved successfully' })
  getFactoryStructure(@Param('id') id: string) {
    return this.factoryService.getFactoryStructure(id);
  }

  @Get(':id/lines')
  @ApiOperation({ summary: 'Get lines of a factory' })
  @ApiQuery({ name: 'includeTeams', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Factory lines retrieved successfully' })
  getFactoryLines(
    @Param('id') id: string,
    @Query('includeTeams') includeTeams?: boolean
  ) {
    return this.factoryService.getFactoryLines(id, { includeTeams });
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Update factory' })
  @ApiResponse({ status: 200, description: 'Factory updated successfully' })
  update(
    @Param('id') id: string,
    @Body() updateFactoryDto: UpdateFactoryDto
  ) {
    return this.factoryService.update(id, updateFactoryDto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'Delete factory' })
  @ApiResponse({ status: 200, description: 'Factory deleted successfully' })
  remove(@Param('id') id: string) {
    return this.factoryService.remove(id);
  }
}
