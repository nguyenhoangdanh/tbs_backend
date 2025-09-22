import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Injectable()
export class DatabaseWrapper {
  private readonly logger = new Logger(DatabaseWrapper.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Wrapper cho tất cả database operations với xử lý auto-sleep
   */
  async executeQuery<T>(
    operation: string,
    queryFn: () => Promise<T>,
    retries = 3
  ): Promise<T> {
    return this.prisma.safeQuery(async () => {
      try {
        const result = await queryFn();
        return result;
      } catch (error) {
        // Log thông tin operation để debug
        if (error.message?.includes('administrator command')) {
          this.logger.log(`😴 ${operation} - Database was sleeping, operation will retry`);
        }
        throw error;
      }
    }, retries);
  }

  // Convenience methods
  async findMany<T>(model: string, args?: any): Promise<T[]> {
    return this.executeQuery(
      `findMany ${model}`,
      () => (this.prisma as any)[model].findMany(args)
    );
  }

  async findUnique<T>(model: string, args: any): Promise<T | null> {
    return this.executeQuery(
      `findUnique ${model}`,
      () => (this.prisma as any)[model].findUnique(args)
    );
  }

  async create<T>(model: string, args: any): Promise<T> {
    return this.executeQuery(
      `create ${model}`,
      () => (this.prisma as any)[model].create(args)
    );
  }

  async update<T>(model: string, args: any): Promise<T> {
    return this.executeQuery(
      `update ${model}`,
      () => (this.prisma as any)[model].update(args)
    );
  }

  async delete<T>(model: string, args: any): Promise<T> {
    return this.executeQuery(
      `delete ${model}`,
      () => (this.prisma as any)[model].delete(args)
    );
  }
}
