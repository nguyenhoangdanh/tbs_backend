import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateProcessDto } from './dto/create-process.dto';
import { UpdateProcessDto } from './dto/update-process.dto';
import { CreateProductProcessDto } from './dto/create-product-process.dto';
import { UpdateProductProcessDto } from './dto/update-product-process.dto';

@Injectable()
export class ManufacturingService {
  constructor(private prisma: PrismaService) {}

  // Product methods
  async createProduct(createProductDto: CreateProductDto) {
    const { code } = createProductDto;

    // Check if product code already exists
    const existingProduct = await this.prisma.product.findUnique({
      where: { code },
    });

    if (existingProduct) {
      throw new ConflictException('Product with this code already exists');
    }

    return this.prisma.product.create({
      data: createProductDto,
      include: {
        _count: {
          select: { processes: true },
        },
      },
    });
  }

  async findAllProducts(options: { includeProcesses?: boolean } = {}) {
    return this.prisma.product.findMany({
      where: { isActive: true },
      include: {
        processes: options.includeProcesses ? {
          where: { isActive: true },
          include: {
            process: {
              select: {
                id: true,
                name: true,
                code: true,
                description: true,
              },
            },
          },
          orderBy: { sequence: 'asc' },
        } : false,
        _count: {
          select: { processes: true },
        },
      },
      orderBy: { code: 'asc' },
    });
  }

  async findProduct(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        processes: {
          where: { isActive: true },
          include: {
            process: true,
          },
          orderBy: { sequence: 'asc' },
        },
        _count: {
          select: {
            processes: true,
            worksheetItems: true,
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  async updateProduct(id: string, updateProductDto: UpdateProductDto) {
    const product = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    // If updating code, check for conflicts
    if (updateProductDto.code && updateProductDto.code !== product.code) {
      const existingProduct = await this.prisma.product.findUnique({
        where: { code: updateProductDto.code },
      });

      if (existingProduct) {
        throw new ConflictException('Product with this code already exists');
      }
    }

    return this.prisma.product.update({
      where: { id },
      data: updateProductDto,
      include: {
        _count: {
          select: { processes: true },
        },
      },
    });
  }

  async removeProduct(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            processes: true,
            worksheetItems: true,
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (product._count.processes > 0 || product._count.worksheetItems > 0) {
      throw new ConflictException(
        'Cannot delete product with existing processes or worksheet items'
      );
    }

    return this.prisma.product.delete({
      where: { id },
    });
  }

  // Process methods
  async createProcess(createProcessDto: CreateProcessDto) {
    const { code } = createProcessDto;

    // Check if process code already exists
    const existingProcess = await this.prisma.process.findUnique({
      where: { code },
    });

    if (existingProcess) {
      throw new ConflictException('Process with this code already exists');
    }

    return this.prisma.process.create({
      data: createProcessDto,
      include: {
        _count: {
          select: { products: true },
        },
      },
    });
  }

  async findAllProcesses() {
    return this.prisma.process.findMany({
      where: { isActive: true },
      include: {
        _count: {
          select: { products: true },
        },
      },
      orderBy: { code: 'asc' },
    });
  }

  async findProcess(id: string) {
    const process = await this.prisma.process.findUnique({
      where: { id },
      include: {
        products: {
          where: { isActive: true },
          include: {
            product: {
              select: {
                id: true,
                name: true,
                code: true,
                description: true,
              },
            },
          },
          orderBy: { sequence: 'asc' },
        },
        _count: {
          select: {
            products: true,
            worksheetItems: true,
          },
        },
      },
    });

    if (!process) {
      throw new NotFoundException('Process not found');
    }

    return process;
  }

  async updateProcess(id: string, updateProcessDto: UpdateProcessDto) {
    const process = await this.prisma.process.findUnique({
      where: { id },
    });

    if (!process) {
      throw new NotFoundException('Process not found');
    }

    // If updating code, check for conflicts
    if (updateProcessDto.code && updateProcessDto.code !== process.code) {
      const existingProcess = await this.prisma.process.findUnique({
        where: { code: updateProcessDto.code },
      });

      if (existingProcess) {
        throw new ConflictException('Process with this code already exists');
      }
    }

    return this.prisma.process.update({
      where: { id },
      data: updateProcessDto,
      include: {
        _count: {
          select: { products: true },
        },
      },
    });
  }

  async removeProcess(id: string) {
    const process = await this.prisma.process.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            products: true,
            worksheetItems: true,
          },
        },
      },
    });

    if (!process) {
      throw new NotFoundException('Process not found');
    }

    if (process._count.products > 0 || process._count.worksheetItems > 0) {
      throw new ConflictException(
        'Cannot delete process with existing products or worksheet items'
      );
    }

    return this.prisma.process.delete({
      where: { id },
    });
  }

  // Product-Process relationship methods
  async addProcessToProduct(productId: string, createProductProcessDto: CreateProductProcessDto) {
    const { processId, sequence } = createProductProcessDto;

    // Validate product exists
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    // Validate process exists
    const process = await this.prisma.process.findUnique({
      where: { id: processId },
    });

    if (!process) {
      throw new NotFoundException('Process not found');
    }

    // Check if relationship already exists
    const existingRelation = await this.prisma.productProcess.findUnique({
      where: {
        productId_processId: {
          productId,
          processId,
        },
      },
    });

    if (existingRelation) {
      throw new ConflictException('Process already added to this product');
    }

    // Handle sequence assignment and validation
    let finalSequence = sequence;
    
    if (finalSequence) {
      // Check if sequence is already taken by another process in this product
      const conflictingProcess = await this.prisma.productProcess.findFirst({
        where: {
          productId,
          sequence: finalSequence,
          isActive: true, // Only check active processes for sequence conflicts
        },
        include: {
          process: { select: { name: true, code: true } },
        },
      });

      if (conflictingProcess) {
        throw new ConflictException(
          `Sequence ${finalSequence} is already occupied by process "${conflictingProcess.process.name}" (${conflictingProcess.process.code}). Please choose a different sequence number.`
        );
      }
    } else {
      // Auto-assign next available sequence
      const maxSequence = await this.prisma.productProcess.aggregate({
        where: { 
          productId,
          isActive: true 
        },
        _max: { sequence: true },
      });
      
      finalSequence = (maxSequence._max.sequence || 0) + 1;
    }

    return this.prisma.productProcess.create({
      data: {
        productId,
        processId,
        standardOutputPerHour: createProductProcessDto.standardOutputPerHour,
        sequence: finalSequence,
      },
      include: {
        product: {
          select: { id: true, name: true, code: true },
        },
        process: {
          select: { id: true, name: true, code: true },
        },
      },
    });
  }

  async getProductProcesses(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return this.prisma.productProcess.findMany({
      where: {
        productId,
        isActive: true,
      },
      include: {
        process: true,
      },
      orderBy: { sequence: 'asc' },
    });
  }

  async getProductProcess(productId: string, processId: string) {
    const productProcess = await this.prisma.productProcess.findUnique({
      where: {
        productId_processId: {
          productId,
          processId,
        },
      },
      include: {
        product: true,
        process: true,
      },
    });

    if (!productProcess) {
      throw new NotFoundException('Product-process combination not found');
    }

    return productProcess;
  }

  // ✅ NEW: Update product-process method
  async updateProductProcess(productId: string, processId: string, updateProductProcessDto: UpdateProductProcessDto) {
    // Validate that the relationship exists
    const existingRelation = await this.prisma.productProcess.findUnique({
      where: {
        productId_processId: {
          productId,
          processId,
        },
      },
      include: {
        product: true,
        process: true,
      },
    });

    if (!existingRelation) {
      throw new NotFoundException('Product-process combination not found');
    }

    // If updating sequence, check for conflicts
    if (updateProductProcessDto.sequence !== undefined && updateProductProcessDto.sequence !== existingRelation.sequence) {
      const conflictingRelation = await this.prisma.productProcess.findFirst({
        where: {
          productId,
          sequence: updateProductProcessDto.sequence,
          isActive: true, // Only check active processes
          id: {
            not: existingRelation.id, // Exclude current relation
          },
        },
        include: {
          process: { select: { name: true, code: true } },
        },
      });

      if (conflictingRelation) {
        throw new ConflictException(
          `Sequence ${updateProductProcessDto.sequence} is already occupied by process "${conflictingRelation.process.name}" (${conflictingRelation.process.code}). Please choose a different sequence number.`
        );
      }

      // Validate sequence is positive
      if (updateProductProcessDto.sequence < 1) {
        throw new ConflictException('Sequence must be greater than 0');
      }
    }

    // If setting isActive to false, allow sequence conflicts (inactive processes don't block sequences)
    const updatedData = { ...updateProductProcessDto };

    return this.prisma.productProcess.update({
      where: {
        productId_processId: {
          productId,
          processId,
        },
      },
      data: updatedData,
      include: {
        product: {
          select: { id: true, name: true, code: true },
        },
        process: {
          select: { id: true, name: true, code: true, description: true },
        },
      },
    });
  }

  // ✅ ENHANCED: Remove process with sequence reordering option
  async removeProcessFromProduct(productId: string, processId: string, reorderSequences: boolean = false) {
    const productProcess = await this.prisma.productProcess.findUnique({
      where: {
        productId_processId: {
          productId,
          processId,
        },
      },
    });

    if (!productProcess) {
      throw new NotFoundException('Product-process combination not found');
    }

    const deletedSequence = productProcess.sequence;

    // Delete the product-process relationship
    await this.prisma.productProcess.delete({
      where: {
        productId_processId: {
          productId,
          processId,
        },
      },
    });

    // Optional: Reorder remaining sequences to fill gaps
    if (reorderSequences) {
      const remainingProcesses = await this.prisma.productProcess.findMany({
        where: {
          productId,
          sequence: { gt: deletedSequence },
          isActive: true,
        },
        orderBy: { sequence: 'asc' },
      });

      // Update sequences to fill the gap
      for (const process of remainingProcesses) {
        await this.prisma.productProcess.update({
          where: { id: process.id },
          data: { sequence: process.sequence - 1 },
        });
      }
    }

    return { success: true, message: 'Process removed from product successfully' };
  }

  // ✅ NEW: Get sequence validation info for a product
  async getProductSequenceInfo(productId: string) {
    const processes = await this.prisma.productProcess.findMany({
      where: { 
        productId,
        isActive: true 
      },
      include: {
        process: { select: { name: true, code: true } },
      },
      orderBy: { sequence: 'asc' },
    });

    const occupiedSequences = processes.map(pp => pp.sequence);
    const maxSequence = Math.max(...occupiedSequences, 0);
    const availableSequences = [];
    
    // Find gaps in sequence
    for (let i = 1; i <= maxSequence + 5; i++) {
      if (!occupiedSequences.includes(i)) {
        availableSequences.push(i);
      }
    }

    return {
      totalProcesses: processes.length,
      occupiedSequences: processes.map(pp => ({
        sequence: pp.sequence,
        processName: pp.process.name,
        processCode: pp.process.code,
      })),
      nextAvailableSequence: Math.max(...occupiedSequences, 0) + 1,
      availableSequences: availableSequences.slice(0, 10), // Limit to first 10 available
      maxSequence,
    };
  }
}
