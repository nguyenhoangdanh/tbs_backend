import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationService } from './notification.service';
import { NotificationGateway } from './notification.gateway';

@Injectable()
export class NotificationCleanupService {
  private readonly logger = new Logger(NotificationCleanupService.name);

  constructor(
    @Optional() private readonly notificationService?: NotificationService,
    @Optional() private readonly notificationGateway?: NotificationGateway,
  ) {}

  /**
   * Clean up invalid push subscriptions every day at 2 AM
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cleanupInvalidSubscriptions() {
    if (!this.notificationService) {
      this.logger.debug('NotificationService not available, skipping subscription cleanup');
      return;
    }

    try {
      this.logger.log('Starting scheduled cleanup of invalid push subscriptions...');
      const result = await this.notificationService.cleanupInvalidSubscriptions();
      
      if (result.removedCount > 0) {
        this.logger.log(`✅ Cleaned up ${result.removedCount} invalid push subscriptions`);
      } else {
        this.logger.debug('No invalid subscriptions found to clean up');
      }

      if (result.errors.length > 0) {
        this.logger.warn(`Cleanup completed with errors: ${result.errors.join('; ')}`);
      }
    } catch (error) {
      this.logger.error('Failed to run scheduled subscription cleanup:', error);
    }
  }

  /**
   * Clean up stale WebSocket connections every 30 minutes
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async cleanupStaleConnections() {
    if (!this.notificationGateway) {
      this.logger.debug('NotificationGateway not available, skipping connection cleanup');
      return;
    }

    try {
      this.logger.debug('Starting scheduled cleanup of stale WebSocket connections...');
      const removedCount = await this.notificationGateway.cleanupStaleConnections();
      
      if (removedCount > 0) {
        this.logger.log(`✅ Cleaned up ${removedCount} stale WebSocket connections`);
      }
    } catch (error) {
      this.logger.error('Failed to run scheduled connection cleanup:', error);
    }
  }

  /**
   * Log notification system health every hour
   */
  @Cron(CronExpression.EVERY_HOUR)
  async logSystemHealth() {
    try {
      const stats = {
        timestamp: new Date().toISOString(),
        pushNotifications: null as any,
        webSocket: null as any,
      };

      // Get push notification stats
      if (this.notificationService) {
        try {
          const pushHealth = await this.notificationService.checkPushNotificationHealth();
          const pushStats = await this.notificationService.getPushNotificationStats();
          stats.pushNotifications = {
            status: pushHealth.status,
            subscriptions: pushStats.totalSubscriptions,
            users: pushStats.subscriptionsByUser,
            recent: pushStats.recentSubscriptions,
            vapidConfigured: pushHealth.vapidConfigured,
          };
        } catch (error) {
          stats.pushNotifications = { error: error.message };
        }
      }

      // Get WebSocket stats
      if (this.notificationGateway) {
        try {
          const wsHealth = this.notificationGateway.getHealthStatus();
          const wsStats = this.notificationGateway.getConnectionStats();
          stats.webSocket = {
            status: wsHealth.status,
            connections: wsStats.totalConnections,
            users: wsStats.uniqueUsers,
          };
        } catch (error) {
          stats.webSocket = { error: error.message };
        }
      }

      // this.logger.log(`📊 Notification System Health: ${JSON.stringify(stats, null, 2)}`);
    } catch (error) {
      this.logger.error('Failed to log system health:', error);
    }
  }

  /**
   * Manual cleanup method for testing/debugging
   */
  async runManualCleanup(): Promise<{
    subscriptionsRemoved: number;
    connectionsRemoved: number;
    errors: string[];
  }> {
    const result = {
      subscriptionsRemoved: 0,
      connectionsRemoved: 0,
      errors: [],
    };

    // Clean up subscriptions
    if (this.notificationService) {
      try {
        const subResult = await this.notificationService.cleanupInvalidSubscriptions();
        result.subscriptionsRemoved = subResult.removedCount;
        result.errors.push(...subResult.errors);
      } catch (error) {
        result.errors.push(`Subscription cleanup error: ${error.message}`);
      }
    }

    // Clean up connections
    if (this.notificationGateway) {
      try {
        result.connectionsRemoved = await this.notificationGateway.cleanupStaleConnections();
      } catch (error) {
        result.errors.push(`Connection cleanup error: ${error.message}`);
      }
    }

    return result;
  }
}