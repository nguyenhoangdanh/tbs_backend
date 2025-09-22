import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { PrismaService } from './common/prisma.service';
import { Public } from './common/decorators/public.decorator';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prismaService: PrismaService,
  ) {}

  @Get()
  getHello(): any {
    return {
      message: 'Weekly Work Report API',
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      endpoints: {
        health: '/health',
        apiHealth: '/api/health',
        dbHealth: '/api/health/db',
        docs: process.env.NODE_ENV !== 'production' ? '/api' : null,
      },
    };
  }

  @Public()
  @Get('health')
  async getHealth() {
    try {
      const isDbHealthy = await this.prismaService.isHealthy();
      
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        environment: process.env.NODE_ENV || 'development',
        database: isDbHealthy ? 'connected' : 'disconnected',
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB',
        },
        version: '1.0.0',
      };
    } catch (error) {
      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        environment: process.env.NODE_ENV || 'development',
        database: 'error',
        error: error.message,
        version: '1.0.0',
      };
    }
  }

  @Public()
  @Get('api/health')
  async getApiHealth() {
    return this.getHealth();
  }

  @Public()
  @Get('api/health/db')
  async getDatabaseHealth() {
    try {
      const connectionInfo = await this.prismaService.getConnectionInfo();
      
      if (connectionInfo) {
        return {
          status: 'ok',
          database: connectionInfo.database,
          username: connectionInfo.username,
          version: connectionInfo.version?.split(' ')[0] || 'unknown',
          serverTime: connectionInfo.server_time,
          connection: 'healthy',
          timestamp: new Date().toISOString(),
        };
      } else {
        return {
          status: 'error',
          database: 'unreachable',
          connection: 'unhealthy',
          timestamp: new Date().toISOString(),
        };
      }
    } catch (error) {
      return {
        status: 'error',
        database: 'unreachable',
        connection: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }
}
