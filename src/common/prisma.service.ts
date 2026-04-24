import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Singleton PrismaService — shared across the entire application via @Global() CommonModule.
 * One PrismaClient instance = one connection pool shared by all modules.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: process.env.NODE_ENV === 'production' ? ['error'] : ['error', 'warn'],
      errorFormat: 'minimal',
    });
  }

  async onModuleInit() {
    let retries = 0;
    const maxRetries = 5;
    while (retries < maxRetries) {
      try {
        this.logger.log(`🔄 Connecting to database (attempt ${retries + 1}/${maxRetries})...`);
        await this.$connect();
        await this.$queryRaw`SELECT 1`;
        this.logger.log('✅ Connected to database successfully');
        return;
      } catch (error) {
        retries++;
        this.logger.error(`❌ Connection failed (${retries}/${maxRetries}): ${error.message}`);
        if (retries >= maxRetries) {
          if (process.env.NODE_ENV === 'production') {
            this.logger.warn('⚠️ Max retries reached. App will continue but may be unstable.');
            return;
          }
          throw new Error(`Database connection failed after ${maxRetries} attempts: ${error.message}`);
        }
        const delay = Math.min(2000 * Math.pow(2, retries - 1), 30000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  async onModuleDestroy() {
    this.logger.log('🔄 Disconnecting from database...');
    await this.$disconnect();
    this.logger.log('✅ Database disconnected successfully');
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  async safeQuery<T>(queryFn: () => Promise<T>, retries = 2): Promise<T> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await queryFn();
      } catch (error) {
        if (attempt === retries) throw error;
        this.logger.warn(`🔄 Query failed (attempt ${attempt}/${retries}), retrying...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  async getConnectionInfo(): Promise<any> {
    try {
      const result = await this.$queryRaw`
        SELECT
          current_database() as database,
          current_user as username,
          version() as version,
          NOW() as server_time
      ` as any[];
      return result[0];
    } catch (error) {
      this.logger.error('Failed to get connection info:', error.message);
      return null;
    }
  }
}
