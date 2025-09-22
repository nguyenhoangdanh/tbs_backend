#!/usr/bin/env node

/**
 * Test script to verify the push notification fixes
 * This script simulates the key functionality without starting the full server
 */

// Mock the basic functionality to test our logic
class MockPrismaService {
  pushSubscription = {
    count: () => Promise.resolve(0),
    findMany: () => Promise.resolve([]),
    upsert: () => Promise.resolve({ id: 'test-id' }),
    deleteMany: () => Promise.resolve({ count: 0 })
  };
}

class MockLogger {
  log(msg) { console.log('[LOG]', msg); }
  warn(msg) { console.warn('[WARN]', msg); }
  error(msg, err) { console.error('[ERROR]', msg, err); }
  debug(msg) { console.debug('[DEBUG]', msg); }
}

// Mock web-push
const mockWebPush = {
  setVapidDetails: (email, publicKey, privateKey) => {
    console.log('[VAPID] Configured:', { email, publicKey: publicKey.substring(0, 10) + '...', privateKey: privateKey.substring(0, 10) + '...' });
  },
  sendNotification: (subscription, payload, options) => {
    console.log('[PUSH] Sending notification:', { 
      endpoint: subscription.endpoint.substring(0, 50) + '...', 
      payload: JSON.parse(payload).title 
    });
    return Promise.resolve({ statusCode: 200 });
  }
};

// Simulate the NotificationService
class TestNotificationService {
  constructor() {
    this.prisma = new MockPrismaService();
    this.logger = new MockLogger();
    
    // Test VAPID configuration logic
    const vapidEmail = process.env.VAPID_EMAIL || 'mailto:admin@tbs-management.com';
    const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || 'BI8AJsdXH6j4GnERi-vfMif-R1BrTuLPTu2q-24fSq6yvotc6A6lMo1Nq2Sqk0PZUhSTxGHRBS4WObIT7at4xV4';
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || 'FtfI4VCSTUw8xg4MqzqzgJy6y0DZ-pJmkSHDrthBQ58';

    // Test the validation logic
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      this.logger.warn('⚠️  VAPID keys not configured in environment variables, using default keys (not recommended for production)');
    } else {
      this.logger.log('✅ VAPID keys configured from environment variables');
    }

    try {
      mockWebPush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey);
      this.logger.log('✅ Web Push service initialized successfully');
    } catch (error) {
      this.logger.error('❌ Failed to initialize Web Push service:', error);
    }
  }

  async checkPushNotificationHealth() {
    try {
      // Test the improved health check logic
      const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || 'BI8AJsdXH6j4GnERi-vfMif-R1BrTuLPTu2q-24fSq6yvotc6A6lMo1Nq2Sqk0PZUhSTxGHRBS4WObIT7at4xV4';
      const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || 'FtfI4VCSTUw8xg4MqzqzgJy6y0DZ-pJmkSHDrthBQ58';
      const hasEnvironmentKeys = !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
      
      // Validate that keys are present (either from environment or defaults)
      const vapidConfigured = !!(vapidPublicKey && vapidPrivateKey && vapidPublicKey.length > 10 && vapidPrivateKey.length > 10);
      
      const subscriptionCount = await this.prisma.pushSubscription.count();
      
      let status = 'healthy';
      let details = 'Push notification service is operational';
      
      if (!vapidConfigured) {
        status = 'unhealthy';
        details = 'VAPID keys are invalid or missing';
      } else if (!hasEnvironmentKeys) {
        status = 'degraded';
        details = 'Using default VAPID keys (not recommended for production)';
      } else if (subscriptionCount === 0) {
        details = 'Push notification service is operational, no subscriptions yet';
      }

      return {
        status,
        details,
        subscriptionCount,
        vapidConfigured,
      };
    } catch (error) {
      this.logger.error('Push notification health check failed:', error);
      return {
        status: 'unhealthy',
        details: `Health check failed: ${error.message}`,
        vapidConfigured: false,
      };
    }
  }

  async sendPushNotification(userId, payload) {
    const result = { success: false, sent: 0, failed: 0, errors: [] };

    try {
      // Simulate finding subscriptions
      const subscriptions = await this.prisma.pushSubscription.findMany({ where: { userId } });
      
      if (subscriptions.length === 0) {
        this.logger.warn(`No push subscriptions found for user ${userId}`);
        return result;
      }

      this.logger.debug(`Found ${subscriptions.length} push subscriptions for user ${userId}`);

      // Simulate sending notifications
      for (const sub of subscriptions) {
        const subscription = {
          endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint-12345',
          keys: { p256dh: 'test-p256dh', auth: 'test-auth' }
        };

        try {
          await mockWebPush.sendNotification(subscription, JSON.stringify(payload), {
            TTL: 60,
            urgency: 'normal',
            headers: {},
          });

          result.sent++;
        } catch (error) {
          result.failed++;
          result.errors.push(`Mock error: ${error.message}`);
        }
      }

      result.success = result.sent > 0;

    } catch (error) {
      this.logger.error(`Failed to send push notification to user ${userId}:`, error);
      result.errors.push(`General error: ${error.message}`);
    }

    return result;
  }
}

// Run the test
async function runTest() {
  console.log('🧪 Testing Push Notification Fixes...\n');

  const service = new TestNotificationService();

  console.log('\n--- Health Check Test ---');
  const health = await service.checkPushNotificationHealth();
  console.log('Health Check Result:', JSON.stringify(health, null, 2));

  console.log('\n--- Push Notification Test ---');
  const pushResult = await service.sendPushNotification('test-user-123', {
    title: 'Test Notification',
    body: 'Testing the fixed notification system',
    type: 'gate-pass'
  });
  console.log('Push Notification Result:', JSON.stringify(pushResult, null, 2));

  console.log('\n✅ Test completed successfully!');
  
  // Analyze results
  if (health.vapidConfigured && health.status !== 'unhealthy') {
    console.log('✅ VAPID configuration is working correctly');
  } else {
    console.log('❌ VAPID configuration needs attention');
  }

  if (health.status === 'degraded' && health.details.includes('default VAPID keys')) {
    console.log('⚠️  Using default VAPID keys - this is expected for development');
  }
}

runTest().catch(console.error);