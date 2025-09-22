import { Controller, Get, Post } from '@nestjs/common';
import { DatabaseService } from '../common/database/database.service';
import { Public } from '../common/decorators/public.decorator';
import { NotificationService } from '../notifications/notification.service';
import { NotificationGateway } from '../notifications/notification.gateway';
import { NotificationCleanupService } from '../notifications/notification-cleanup.service';
import { Optional } from '@nestjs/common';

@Controller('health')
@Public()
export class HealthController {
  constructor(
    private readonly databaseService: DatabaseService,
    @Optional() private readonly notificationService?: NotificationService,
    @Optional() private readonly notificationGateway?: NotificationGateway,
    @Optional() private readonly cleanupService?: NotificationCleanupService,
  ) {}

  @Get()
  async getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV,
      version: '1.0.0',
    };
  }

  @Get('db')
  async getDatabaseHealth() {
    try {
      const healthCheck = await this.databaseService.healthCheck();

      return {
        status: healthCheck.status === 'healthy' ? 'ok' : 'error',
        database: healthCheck,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'error',
        database: {
          status: 'unhealthy',
          error: error.message,
        },
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('notifications')
  async getNotificationHealth() {
    try {
      const health = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        pushNotifications: null as any,
        webSocket: null as any,
      };

      // Check push notification service health
      if (this.notificationService) {
        try {
          const pushHealth = await this.notificationService.checkPushNotificationHealth();
          const pushStats = await this.notificationService.getPushNotificationStats();
          health.pushNotifications = {
            ...pushHealth,
            stats: pushStats,
          };
        } catch (error) {
          health.pushNotifications = {
            status: 'unhealthy',
            details: `Push notification health check failed: ${error.message}`,
          };
        }
      } else {
        health.pushNotifications = {
          status: 'unavailable',
          details: 'Notification service not available',
        };
      }

      // Check WebSocket gateway health
      if (this.notificationGateway) {
        try {
          const wsHealth = this.notificationGateway.getHealthStatus();
          const wsStats = this.notificationGateway.getConnectionStats();
          health.webSocket = {
            ...wsHealth,
            stats: wsStats,
          };
        } catch (error) {
          health.webSocket = {
            status: 'unhealthy',
            details: `WebSocket health check failed: ${error.message}`,
          };
        }
      } else {
        health.webSocket = {
          status: 'unavailable',
          details: 'WebSocket gateway not available',
        };
      }

      // Overall health status
      const hasUnhealthyService = 
        health.pushNotifications?.status === 'unhealthy' || 
        health.webSocket?.status === 'unhealthy';
      
      if (hasUnhealthyService) {
        health.status = 'degraded';
      }

      return health;
    } catch (error) {
      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        error: error.message,
      };
    }
  }

  @Get('detailed')
  async getDetailedHealth() {
    try {
      const dbHealth = await this.getDatabaseHealth();
      const notificationHealth = await this.getNotificationHealth();

      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV,
        version: '1.0.0',
        database: dbHealth.database,
        notifications: {
          pushNotifications: 'pushNotifications' in notificationHealth ? notificationHealth.pushNotifications : null,
          webSocket: 'webSocket' in notificationHealth ? notificationHealth.webSocket : null,
        },
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB',
          rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + ' MB',
          external: Math.round(process.memoryUsage().external / 1024 / 1024) + ' MB',
        },
        system: {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
        },
      };
    } catch (error) {
      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV,
        version: '1.0.0',
        error: error.message,
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB',
        },
      };
    }
  }

  @Post('cleanup')
  async runManualCleanup() {
    if (!this.cleanupService) {
      return {
        status: 'error',
        message: 'Cleanup service not available',
        timestamp: new Date().toISOString(),
      };
    }

    try {
      const result = await this.cleanupService.runManualCleanup();
      return {
        status: 'success',
        message: 'Manual cleanup completed',
        timestamp: new Date().toISOString(),
        result,
      };
    } catch (error) {
      return {
        status: 'error',
        message: 'Manual cleanup failed',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }
}
