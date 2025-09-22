import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Service providing access to the Prisma ORM client optimized for Neon PostgreSQL
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private isConnected = false;
  private connectionRetries = 0;
  private maxRetries = 5;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor() {
    super({
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
      log: process.env.NODE_ENV === 'production' ? ['error'] : ['error', 'warn'],
      errorFormat: 'minimal',
      // Valid Prisma configuration options only
      transactionOptions: {
        timeout: 30000, // 30 second transaction timeout
        maxWait: 10000, // Max wait time for a transaction slot
      },
    });
  }

  /**
   * Connect to the database with retry logic for Neon
   */
  async onModuleInit() {
    await this.connectWithRetry();
    this.setupConnectionMonitoring();
  }

  private async connectWithRetry(): Promise<void> {
    while (this.connectionRetries < this.maxRetries && !this.isConnected) {
      try {
        this.logger.log(`🔄 Connecting to Neon database (attempt ${this.connectionRetries + 1}/${this.maxRetries})...`);
        
        // Connect with extended timeout for Neon
        await Promise.race([
          this.$connect(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Connection timeout after 60s')), 60000)
          ),
        ]);

        // Test connection with a simple query
        await Promise.race([
          this.$queryRaw`SELECT 1 as test, NOW() as current_time`,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Health check timeout')), 10000)
          ),
        ]);
        
        this.isConnected = true;
        this.connectionRetries = 0;
        this.reconnectAttempts = 0;
        
        this.logger.log('✅ Connected to Neon PostgreSQL successfully');
        return;
      } catch (error) {
        this.connectionRetries++;
        this.logger.error(`❌ Connection failed (${this.connectionRetries}/${this.maxRetries}):`, error.message);
        
        // Log specific error details
        this.logConnectionError(error);
        
        if (this.connectionRetries >= this.maxRetries) {
          if (process.env.NODE_ENV === 'production') {
            this.logger.warn('⚠️ Max retries reached. App will continue but may be unstable.');
            return;
          } else {
            throw new Error(`Neon database connection failed after ${this.maxRetries} attempts: ${error.message}`);
          }
        }

        // Progressive backoff: 2s, 4s, 8s, 16s, 30s (max)
        const baseDelay = Math.min(2000 * Math.pow(2, this.connectionRetries - 1), 30000);
        const jitter = Math.random() * 2000;
        const totalDelay = Math.floor(baseDelay + jitter);
        
        this.logger.log(`⏳ Retrying in ${totalDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, totalDelay));
      }
    }
  }

  private setupConnectionMonitoring(): void {
    // Với Launch plan, có thể tăng tần suất heartbeat
    if (process.env.NODE_ENV === 'production') {
      this.heartbeatInterval = setInterval(async () => {
        try {
          await this.$queryRaw`SELECT 1`;
          if (!this.isConnected) {
            this.isConnected = true;
            this.logger.log('✅ Database connection restored');
          }
        } catch (error) {
          if (this.isConnected) {
            this.isConnected = false;
            this.logger.warn('💔 Database connection lost');
          }
        }
      }, 60000); // Có thể giảm xuống 1 phút
    }
  }

  private logConnectionError(error: any): void {
    const message = error.message?.toLowerCase() || '';
    
    // Với Launch plan, bỏ auto-sleep handling
    // if (message.includes('terminating connection due to administrator command')) {
    //   // Không cần xử lý auto-sleep nữa
    // }
    
    if (message.includes('enotfound') || message.includes('getaddrinfo')) {
      this.logger.error('🌐 DNS resolution failed - check network connectivity');
    } else if (message.includes('econnrefused')) {
      this.logger.error('🚪 Connection refused - database may be unavailable');
    } else if (message.includes('timeout')) {
      this.logger.error('⏰ Connection timeout - network latency issue');
    } else if (message.includes('authentication') || message.includes('password')) {
      this.logger.error('🔐 Authentication failed - Check Neon credentials');
      this.logger.error('💡 Verify username/password in Neon console');
    } else if (message.includes('database') && message.includes('does not exist')) {
      this.logger.error('🗄️ Database does not exist - Check database name in Neon');
    } else if (message.includes('ssl') || message.includes('tls')) {
      this.logger.error('🔒 SSL/TLS error - Neon requires SSL connections');
      this.logger.error('💡 Ensure sslmode=require in connection string');
    } else if (message.includes('too many connections')) {
      this.logger.error('🔗 Too many connections - Neon connection limit reached');
      this.logger.error('💡 Consider connection pooling or reduce concurrent connections');
    } else {
      this.logger.error(`🔍 Neon database error: ${error.message}`);
    }
  }

  /**
   * Enhanced health check with automatic reconnection
   */
  async isHealthy(): Promise<boolean> {
    try {
      await Promise.race([
        this.$queryRaw`SELECT 1 as health, NOW() as timestamp`,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Health check timeout')), 10000)
        ),
      ]);
      
      if (!this.isConnected) {
        this.isConnected = true;
        this.logger.log('✅ Database connection restored');
      }
      
      return true;
    } catch (error) {
      this.isConnected = false;
      this.logger.error('💔 Database health check failed:', error.message);
      
      // Attempt immediate reconnection for critical health checks
      if (error.message.includes('connection') || error.message.includes('network') || error.message.includes('database server')) {
        this.logger.log('🔄 Attempting immediate reconnection...');
        try {
          // Reset connection state and retry
          this.connectionRetries = 0;
          await this.connectWithRetry();
          // Test again after reconnection
          return await this.isHealthy();
        } catch (reconnectError) {
          this.logger.error('❌ Immediate reconnection failed:', reconnectError.message);
        }
      }
      
      return false;
    }
  }

  async safeQuery<T>(queryFn: () => Promise<T>, retries = 2): Promise<T> {
    // Giảm retries xuống 2 vì không có auto-sleep
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await queryFn();
      } catch (error) {
        if (attempt === retries) throw error;
        
        const isConnectionError = error.message?.includes('database server') || 
                                 error.message?.includes('connection') ||
                                 error.message?.includes('network');
        
        if (isConnectionError) {
          this.logger.warn(`🔄 Query failed (attempt ${attempt}/${retries}), retrying...`);
          this.isConnected = false;
          await this.connectWithRetry();
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          throw error;
        }
      }
    }
  }

  async getConnectionInfo(): Promise<any> {
    try {
      const result = await this.safeQuery(() => 
        this.$queryRaw`
          SELECT 
            current_database() as database,
            current_user as username,
            version() as version,
            NOW() as server_time,
            inet_server_addr() as server_ip
        ` as Promise<any[]>
      );
      return result[0];
    } catch (error) {
      this.logger.error('Failed to get connection info:', error.message);
      return null;
    }
  }

  /**
   * Disconnect from the database when the module is destroyed
   */
  async onModuleDestroy() {
    // Clear heartbeat interval
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.isConnected) {
      this.logger.log('🔄 Disconnecting from Neon database...');
      try {
        await this.$disconnect();
        this.isConnected = false;
        this.logger.log('✅ Database disconnected successfully');
      } catch (error) {
        this.logger.error('❌ Error during disconnect:', error.message);
      }
    }
  }
}