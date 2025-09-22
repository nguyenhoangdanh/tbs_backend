import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Put,
  Patch,
  UseGuards,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { ManufacturingService } from './manufacturing.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateProcessDto } from './dto/create-process.dto';
import { UpdateProcessDto } from './dto/update-process.dto';
import { CreateProductProcessDto } from './dto/create-product-process.dto';
import { UpdateProductProcessDto } from './dto/update-product-process.dto';

@ApiTags('manufacturing')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('manufacturing')
export class ManufacturingController {
  constructor(private readonly manufacturingService: ManufacturingService) {}

  // Product endpoints
  @Post('products')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Create new product' })
  @ApiResponse({ status: 201, description: 'Product created successfully' })
  createProduct(@Body() createProductDto: CreateProductDto) {
    return this.manufacturingService.createProduct(createProductDto);
  }

  @Get('products')
  @ApiOperation({ summary: 'Get all products' })
  @ApiQuery({ name: 'includeProcesses', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Products retrieved successfully' })
  findAllProducts(@Query('includeProcesses') includeProcesses?: boolean) {
    return this.manufacturingService.findAllProducts({ includeProcesses });
  }

  @Get('products/:id')
  @ApiOperation({ summary: 'Get product by ID' })
  @ApiResponse({ status: 200, description: 'Product retrieved successfully' })
  findProduct(@Param('id') id: string) {
    return this.manufacturingService.findProduct(id);
  }

  @Put('products/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Update product' })
  @ApiResponse({ status: 200, description: 'Product updated successfully' })
  updateProduct(@Param('id') id: string, @Body() updateProductDto: UpdateProductDto) {
    return this.manufacturingService.updateProduct(id, updateProductDto);
  }

  @Delete('products/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'Delete product' })
  @ApiResponse({ status: 200, description: 'Product deleted successfully' })
  removeProduct(@Param('id') id: string) {
    return this.manufacturingService.removeProduct(id);
  }

  // Process endpoints
  @Post('processes')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Create new process' })
  @ApiResponse({ status: 201, description: 'Process created successfully' })
  createProcess(@Body() createProcessDto: CreateProcessDto) {
    return this.manufacturingService.createProcess(createProcessDto);
  }

  @Get('processes')
  @ApiOperation({ summary: 'Get all processes' })
  @ApiResponse({ status: 200, description: 'Processes retrieved successfully' })
  findAllProcesses() {
    return this.manufacturingService.findAllProcesses();
  }

  @Get('processes/:id')
  @ApiOperation({ summary: 'Get process by ID' })
  @ApiResponse({ status: 200, description: 'Process retrieved successfully' })
  findProcess(@Param('id') id: string) {
    return this.manufacturingService.findProcess(id);
  }

  @Put('processes/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Update process' })
  @ApiResponse({ status: 200, description: 'Process updated successfully' })
  updateProcess(@Param('id') id: string, @Body() updateProcessDto: UpdateProcessDto) {
    return this.manufacturingService.updateProcess(id, updateProcessDto);
  }

  @Delete('processes/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'Delete process' })
  @ApiResponse({ status: 200, description: 'Process deleted successfully' })
  removeProcess(@Param('id') id: string) {
    return this.manufacturingService.removeProcess(id);
  }

  // Product-Process relationship endpoints
  @Post('products/:productId/processes')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Add process to product with standard output' })
  @ApiResponse({ status: 201, description: 'Process added to product successfully' })
  addProcessToProduct(
    @Param('productId') productId: string,
    @Body() createProductProcessDto: CreateProductProcessDto
  ) {
    return this.manufacturingService.addProcessToProduct(productId, createProductProcessDto);
  }

  @Get('products/:productId/processes')
  @ApiOperation({ summary: 'Get all processes for a product' })
  @ApiResponse({ status: 200, description: 'Product processes retrieved successfully' })
  getProductProcesses(@Param('productId') productId: string) {
    return this.manufacturingService.getProductProcesses(productId);
  }

  @Get('product-process/:productId/:processId')
  @ApiOperation({ summary: 'Get specific product-process combination' })
  @ApiResponse({ status: 200, description: 'Product-process retrieved successfully' })
  getProductProcess(
    @Param('productId') productId: string,
    @Param('processId') processId: string
  ) {
    return this.manufacturingService.getProductProcess(productId, processId);
  }

  // ✅ NEW: Update product-process endpoint
  @Patch('products/:productId/processes/:processId')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Update product-process relationship' })
  @ApiResponse({ status: 200, description: 'Product-process updated successfully' })
  updateProductProcess(
    @Param('productId') productId: string,
    @Param('processId') processId: string,
    @Body() updateProductProcessDto: UpdateProductProcessDto
  ) {
    return this.manufacturingService.updateProductProcess(productId, processId, updateProductProcessDto);
  }

  // ✅ NEW: Get sequence information for a product
  @Get('products/:productId/sequences')
  @ApiOperation({ summary: 'Get sequence validation info for a product' })
  @ApiResponse({ status: 200, description: 'Sequence info retrieved successfully' })
  getProductSequenceInfo(@Param('productId') productId: string) {
    return this.manufacturingService.getProductSequenceInfo(productId);
  }

  @Delete('products/:productId/processes/:processId')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Remove process from product' })
  @ApiQuery({ 
    name: 'reorderSequences', 
    required: false, 
    type: Boolean,
    description: 'Whether to reorder remaining sequences to fill gaps' 
  })
  @ApiResponse({ status: 200, description: 'Process removed from product successfully' })
  removeProcessFromProduct(
    @Param('productId') productId: string,
    @Param('processId') processId: string,
    @Query('reorderSequences') reorderSequences?: boolean
  ) {
    return this.manufacturingService.removeProcessFromProduct(productId, processId, reorderSequences);
  }
}
