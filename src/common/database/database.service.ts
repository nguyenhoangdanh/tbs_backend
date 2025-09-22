import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class DatabaseService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(DatabaseService.name);
  private retryCount = 0;
  private readonly maxRetries = 5;

  constructor() {
    super({
      log: process.env.NODE_ENV === 'production' 
        ? ['error', 'warn'] 
        : ['query', 'info', 'warn', 'error'],
      errorFormat: 'minimal',
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
    });
  }

  async onModuleInit() {
    await this.connectWithRetry();
  }

  private async connectWithRetry(): Promise<void> {
    while (this.retryCount < this.maxRetries) {
      try {
        await this.$connect();
        this.logger.log('✅ Database connected successfully');
        
        // Test connection
        await this.$queryRaw`SELECT 1`;
        this.logger.log('✅ Database connection verified');
        return;
      } catch (error) {
        this.retryCount++;
        this.logger.error(
          `❌ Database connection failed (attempt ${this.retryCount}/${this.maxRetries}): ${error.message}`
        );

        if (this.retryCount >= this.maxRetries) {
          this.logger.error('❌ Max retry attempts reached. Exiting...');
          throw new Error(`Database connection failed after ${this.maxRetries} attempts`);
        }

        const delay = Math.min(1000 * Math.pow(2, this.retryCount - 1), 10000);
        this.logger.log(`⏳ Retrying database connection in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  async healthCheck(): Promise<{ status: string; latency?: number }> {
    try {
      const start = Date.now();
      await this.$queryRaw`SELECT 1`;
      const latency = Date.now() - start;
      
      return { status: 'healthy', latency };
    } catch (error) {
      this.logger.error('Database health check failed:', error.message);
      return { status: 'unhealthy' };
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('📤 Database disconnected');
  }
}
