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
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { PositionService } from '../services/position.service';
import { CreatePositionDto } from '../dto/position/create-position.dto';
import { UpdatePositionDto } from '../dto/position/update-position.dto';

@ApiTags('organization/positions')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@RequirePermissions('organizations:view')
@Controller('organization/positions')
export class PositionController {
  constructor(private readonly positionService: PositionService) {}

  @Post()
  @Roles('ADMIN', 'SUPERADMIN')
  @RequirePermissions('organizations:manage')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create new position' })
  @ApiResponse({ status: 201, description: 'Position created successfully' })
  create(@Body() createPositionDto: CreatePositionDto) {
    return this.positionService.create(createPositionDto);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all positions' })
  @ApiResponse({
    status: 200,
    description: 'Positions retrieved successfully',
  })
  findAll() {
    return this.positionService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get position by ID' })
  @ApiResponse({
    status: 200,
    description: 'Position retrieved successfully',
  })
  findOne(@Param('id') id: string) {
    return this.positionService.findOne(id);
  }

  @Put(':id')
  @Roles('ADMIN', 'SUPERADMIN')
  @RequirePermissions('organizations:manage')
  @ApiOperation({ summary: 'Update position' })
  @ApiResponse({ status: 200, description: 'Position updated successfully' })
  update(
    @Param('id') id: string,
    @Body() updatePositionDto: UpdatePositionDto,
  ) {
    return this.positionService.update(id, updatePositionDto);
  }

  @Delete(':id')
  @Roles('SUPERADMIN')
  @RequirePermissions('organizations:manage')
  @ApiOperation({ summary: 'Delete position' })
  @ApiResponse({ status: 200, description: 'Position deleted successfully' })
  remove(@Param('id') id: string) {
    return this.positionService.remove(id);
  }
}
