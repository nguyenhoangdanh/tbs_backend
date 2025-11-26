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
import { LineService } from '../services/line.service';
import { CreateLineDto } from '../dto/line/create-line.dto';
import { UpdateLineDto } from '../dto/line/update-line.dto';
import { TransferLineDto } from '../dto/line/transfer-line.dto';

@ApiTags('production/lines')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard) // ⭐ Use PermissionsGuard
@Controller('production/lines')
export class LineController {
  constructor(private readonly lineService: LineService) {}

  @Post()
  @RequirePermissions('lines:create') // ⭐ Require permission
  @ApiOperation({ summary: 'Create new line' })
  @ApiResponse({ status: 201, description: 'Line created successfully' })
  create(@Body() createLineDto: CreateLineDto) {
    return this.lineService.create(createLineDto);
  }

  @Get()
  @RequirePermissions('lines:view') // ⭐ Require permission
  @ApiOperation({ summary: 'Get all lines' })
  @ApiResponse({ status: 200, description: 'Lines retrieved successfully' })
  findAll(
    @Query('factoryId') factoryId?: string,
    @Query('includeTeams') includeTeams?: string,
  ) {
    return this.lineService.findAll({
      factoryId,
      includeTeams: includeTeams === 'true',
    });
  }

  @Get(':id')
  @RequirePermissions('lines:view') // ⭐ Require permission
  @ApiOperation({ summary: 'Get line by ID' })
  @ApiResponse({ status: 200, description: 'Line retrieved successfully' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.lineService.findOne(id);
  }

  @Get(':id/teams')
  @RequirePermissions('lines:view') // ⭐ Require permission
  @ApiOperation({ summary: 'Get teams of a line' })
  @ApiResponse({ status: 200, description: 'Teams retrieved successfully' })
  getTeams(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('includeGroups') includeGroups?: string,
  ) {
    return this.lineService.getLineTeams(id, {
      includeGroups: includeGroups === 'true',
    });
  }

  @Put(':id')
  @RequirePermissions('lines:update') // ⭐ Require permission
  @ApiOperation({ summary: 'Update line' })
  @ApiResponse({ status: 200, description: 'Line updated successfully' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateLineDto: UpdateLineDto,
  ) {
    return this.lineService.update(id, updateLineDto);
  }

  @Post(':id/transfer')
  @RequirePermissions('lines:manage') // ⭐ Require manage permission
  @ApiOperation({
    summary: 'Transfer line to another factory',
  })
  @ApiResponse({ status: 200, description: 'Line transferred successfully' })
  transfer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() transferDto: TransferLineDto,
  ) {
    return this.lineService.transferLine(id, transferDto);
  }

  @Delete(':id')
  @RequirePermissions('lines:delete') // ⭐ Require permission
  @ApiOperation({ summary: 'Delete line' })
  @ApiResponse({ status: 200, description: 'Line deleted successfully' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.lineService.remove(id);
  }
}
