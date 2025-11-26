import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  Get,
  Delete,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationService, PushSubscription } from './notification.service';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  // ✅ VAPID public key endpoint - NO AUTH REQUIRED (must be accessible before login)
  @Public()
  @Get('vapid-public-key')
  @ApiOperation({ summary: 'Get VAPID public key for subscription' })
  @ApiResponse({ status: 200, description: 'VAPID public key returned' })
  getVapidPublicKey() {
    const publicKey =
      process.env.VAPID_PUBLIC_KEY ||
      'BI8AJsdXH6j4GnERi-vfMif-R1BrTuLPTu2q-24fSq6yvotc6A6lMo1Nq2Sqk0PZUhSTxGHRBS4WObIT7at4xV4';
    return {
      success: true,
      data: {
        publicKey,
      },
    };
  }

  // All other endpoints require authentication
  @Post('subscribe')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Subscribe to push notifications' })
  @ApiResponse({
    status: 201,
    description: 'Subscription created successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid subscription data' })
  async subscribe(@Request() req, @Body() subscription: PushSubscription) {
    try {
      // Validate subscription data
      if (!subscription.endpoint) {
        return {
          success: false,
          error: 'Missing subscription endpoint',
        };
      }

      if (
        !subscription.keys ||
        !subscription.keys.p256dh ||
        !subscription.keys.auth
      ) {
        return {
          success: false,
          error: 'Missing subscription keys (p256dh and auth required)',
        };
      }

      // Log subscription attempt for debugging
      console.log('📥 Push subscription request:', {
        userId: req.user.id,
        endpoint: subscription.endpoint.substring(0, 50) + '...',
        hasKeys: !!(subscription.keys.p256dh && subscription.keys.auth),
      });

      await this.notificationService.saveSubscription(
        req.user.id,
        subscription,
      );

      console.log(
        '✅ Push subscription saved successfully for user:',
        req.user.id,
      );

      return {
        success: true,
        message: 'Subscription saved successfully',
      };
    } catch (error) {
      console.error('❌ Failed to save push subscription:', error);
      return {
        success: false,
        error: 'Failed to save subscription',
        details: error.message,
      };
    }
  }

  @Post('unsubscribe')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Unsubscribe from push notifications' })
  @ApiResponse({ status: 200, description: 'Unsubscribed successfully' })
  async unsubscribe(@Request() req, @Body() data: { endpoint: string }) {
    await this.notificationService.removeSubscription(
      req.user.id,
      data.endpoint,
    );
    return {
      success: true,
      message: 'Unsubscribed successfully',
    };
  }

  @Get('subscription')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get current user subscription status' })
  @ApiResponse({ status: 200, description: 'Subscription status retrieved' })
  async getSubscription(@Request() req) {
    const subscriptions = await this.notificationService.getUserSubscriptions(
      req.user.id,
    );
    return {
      success: true,
      data: {
        subscribed: subscriptions.length > 0,
        subscriptions: subscriptions,
      },
    };
  }

  @Delete('subscription')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete all subscriptions for current user' })
  @ApiResponse({ status: 200, description: 'All subscriptions deleted' })
  async deleteAllSubscriptions(@Request() req) {
    await this.notificationService.removeAllUserSubscriptions(req.user.id);
    return {
      success: true,
      message: 'All subscriptions deleted successfully',
    };
  }

  @Post('test')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Send test notification to current user' })
  @ApiResponse({ status: 200, description: 'Test notification sent' })
  async sendTestNotification(@Request() req) {
    try {
      console.log('🧪 Test notification requested for user:', req.user.id);

      const result = await this.notificationService.sendPushNotification(
        req.user.id,
        {
          title: 'Test Notification',
          body: 'This is a test notification from TBS Management System',
          type: 'general',
          data: {
            type: 'TEST',
            url: '/dashboard',
          },
        },
      );

      console.log('🧪 Test notification result:', {
        success: result.success,
        sent: result.sent,
        failed: result.failed,
        errors: result.errors.length,
      });

      return {
        success: result.success,
        message: result.success
          ? `Test notification sent successfully (${result.sent} sent, ${result.failed} failed)`
          : `Test notification failed: ${result.errors.join(', ')}`,
        data: {
          sent: result.sent,
          failed: result.failed,
          errors: result.errors,
        },
      };
    } catch (error) {
      console.error('❌ Test notification error:', error);
      return {
        success: false,
        message: 'Test notification failed due to server error',
        error: error.message,
      };
    }
  }
}
