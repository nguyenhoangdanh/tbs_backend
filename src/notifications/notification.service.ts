import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from 'src/common/prisma.service';
import { EmailService } from 'src/common/email.service';
import { NotificationGateway } from './notification.gateway';
import { format } from 'date-fns';
import * as webPush from 'web-push';

export interface EmailData {
  to: string;
  subject: string;
  template: string;
  data: Record<string, any>;
}

export interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  type?: 'gate-pass' | 'worksheet' | 'general';
  url?: string;
  data?: any;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    @Optional() private notificationGateway?: NotificationGateway,
  ) {
    // Validate and configure web-push with VAPID details
    const vapidEmail = process.env.VAPID_EMAIL || 'mailto:admin@tbs-management.com';
    const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || 'BI8AJsdXH6j4GnERi-vfMif-R1BrTuLPTu2q-24fSq6yvotc6A6lMo1Nq2Sqk0PZUhSTxGHRBS4WObIT7at4xV4';
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || 'FtfI4VCSTUw8xg4MqzqzgJy6y0DZ-pJmkSHDrthBQ58';

    // Validate VAPID configuration
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      this.logger.warn('⚠️  VAPID keys not configured in environment variables, using default keys (not recommended for production)');
    } else {
      this.logger.log('✅ VAPID keys configured from environment variables');
    }

    try {
      webPush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey);
      this.logger.log('✅ Web Push service initialized successfully');
    } catch (error) {
      this.logger.error('❌ Failed to initialize Web Push service:', error);
      this.logger.error('Push notifications will not work until VAPID keys are properly configured');
    }
  }

  /**
   * Save a push subscription for a user
   */
  async saveSubscription(userId: string, subscription: PushSubscription): Promise<void> {
    try {
      const result = await this.prisma.pushSubscription.upsert({
        where: {
          userId_endpoint: {
            userId,
            endpoint: subscription.endpoint,
          },
        },
        update: {
          p256dhKey: subscription.keys.p256dh,
          authKey: subscription.keys.auth,
          updatedAt: new Date(),
        },
        create: {
          userId,
          endpoint: subscription.endpoint,
          p256dhKey: subscription.keys.p256dh,
          authKey: subscription.keys.auth,
        },
      });

      this.logger.log(`✅ Push subscription saved for user ${userId} (endpoint: ${subscription.endpoint.substring(0, 50)}...)`);
      
      // Helpful diagnostics
      const userSubscriptionCount = await this.prisma.pushSubscription.count({ where: { userId } });
      const totalSubscriptionCount = await this.prisma.pushSubscription.count();
      this.logger.debug(`User ${userId} now has ${userSubscriptionCount} subscription(s), total system subscriptions: ${totalSubscriptionCount}`);
      
    } catch (error) {
      this.logger.error(`❌ Failed to save subscription for user ${userId}:`, error);
      if (error.code === 'P2002') {
        // Unique constraint violation
        this.logger.error(`Unique constraint violation - subscription may already exist for this user and endpoint`);
      }
      throw new Error('Failed to save push subscription');
    }
  }

  /**
   * Remove subscription for a user by endpoint
   */
  async removeSubscription(userId: string, endpoint: string): Promise<void> {
    try {
      await this.prisma.pushSubscription.deleteMany({
        where: {
          userId,
          endpoint,
        },
      });
      this.logger.log(`Removed push subscription for user ${userId}, endpoint: ${endpoint}`);
    } catch (error) {
      this.logger.error(`Failed to remove push subscription for user ${userId}:`, error);
      throw new Error('Failed to remove push subscription');
    }
  }

  /**
   * Remove all subscriptions for a user
   */
  async removeAllUserSubscriptions(userId: string): Promise<void> {
    try {
      const result = await this.prisma.pushSubscription.deleteMany({
        where: { userId },
      });
      this.logger.log(`Removed ${result.count} push subscriptions for user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to remove all subscriptions for user ${userId}:`, error);
      throw new Error('Failed to remove user subscriptions');
    }
  }

  /**
   * Get all subscriptions for a user
   */
  async getUserSubscriptions(userId: string): Promise<PushSubscription[]> {
    try {
      const subscriptions = await this.prisma.pushSubscription.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });

      return subscriptions.map((sub) => ({
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dhKey,
          auth: sub.authKey,
        },
      }));
    } catch (error) {
      this.logger.error(`Failed to get subscriptions for user ${userId}:`, error);
      return [];
    }
  }

  /**
   * Send push notification to a specific user
   */
  async sendPushNotification(
    userId: string,
    payload: PushNotificationPayload,
  ): Promise<{ success: boolean; sent: number; failed: number; errors: string[] }> {
    const result = { success: false, sent: 0, failed: 0, errors: [] };

    try {
      const subscriptions = await this.prisma.pushSubscription.findMany({
        where: { userId },
      });

      if (subscriptions.length === 0) {
        this.logger.warn(`No push subscriptions found for user ${userId}`);
        // Add helpful diagnostic information
        const totalSubscriptions = await this.prisma.pushSubscription.count();
        this.logger.debug(`Total push subscriptions in database: ${totalSubscriptions}`);
        if (totalSubscriptions === 0) {
          this.logger.debug('💡 No users have subscribed to push notifications yet. Users need to visit the frontend and grant notification permissions.');
        }
        return result;
      }

      this.logger.debug(`Found ${subscriptions.length} push subscriptions for user ${userId}`);

      const payloadString = JSON.stringify(payload);
      const promises = subscriptions.map(async (sub) => {
        try {
          const subscription = {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dhKey,
              auth: sub.authKey,
            },
          };

          // Add timeout and better error handling
          const response = await webPush.sendNotification(subscription, payloadString, {
            TTL: 60, // Time to live in seconds
            urgency: 'normal',
            headers: {},
          });

          this.logger.log(`Push notification sent successfully to user ${userId} at endpoint ${sub.endpoint.substring(0, 50)}...`);
          return { success: true, endpoint: sub.endpoint };
        } catch (error: any) {
          const errorMessage = error.message || 'Unknown error';
          const statusCode = error.statusCode || error.status;
          
          this.logger.error(`Failed to send push notification to ${sub.endpoint.substring(0, 50)}...:`);
          this.logger.error(`Error details: ${errorMessage}, Status: ${statusCode}`);
          
          // Handle different error scenarios
          if (statusCode === 410 || statusCode === 404 || statusCode === 403) {
            // Subscription is invalid, expired, or unauthorized - remove it
            try {
              await this.prisma.pushSubscription.delete({
                where: {
                  userId_endpoint: {
                    userId,
                    endpoint: sub.endpoint,
                  },
                },
              });
              this.logger.log(`Removed invalid/expired subscription for user ${userId}`);
            } catch (deleteError) {
              this.logger.error(`Failed to delete invalid subscription:`, deleteError);
            }
          } else if (statusCode >= 500) {
            // Server error - might be temporary, don't remove subscription
            this.logger.warn(`Server error (${statusCode}) for push notification, keeping subscription`);
          } else if (statusCode === 413) {
            // Payload too large
            this.logger.error(`Push notification payload too large for user ${userId}`);
          } else if (statusCode === 429) {
            // Rate limited
            this.logger.warn(`Rate limited for push notifications to user ${userId}`);
          } else if (!statusCode && errorMessage.includes('ENOTFOUND')) {
            // DNS/Network issue
            this.logger.error(`Network connectivity issue sending push notification: ${errorMessage}`);
          }
          
          return { success: false, endpoint: sub.endpoint, error: `${statusCode || 'Network'}: ${errorMessage}` };
        }
      });

      const results = await Promise.allSettled(promises);
      
      for (const promiseResult of results) {
        if (promiseResult.status === 'fulfilled') {
          const notificationResult = promiseResult.value;
          if (notificationResult.success) {
            result.sent++;
          } else {
            result.failed++;
            result.errors.push(`${notificationResult.endpoint.substring(0, 50)}...: ${notificationResult.error}`);
          }
        } else {
          result.failed++;
          result.errors.push(`Promise rejected: ${promiseResult.reason}`);
        }
      }

      result.success = result.sent > 0;

      if (result.sent > 0) {
        this.logger.log(`Push notification summary for user ${userId}: ${result.sent} sent, ${result.failed} failed`);
      }

    } catch (error) {
      this.logger.error(`Failed to send push notification to user ${userId}:`, error);
      result.errors.push(`General error: ${error.message}`);
    }

    return result;
  }

  /**
   * Send push notifications to multiple users
   */
  async sendPushNotificationToUsers(
    userIds: string[],
    payload: PushNotificationPayload,
  ): Promise<{ totalUsers: number; successfulUsers: number; failedUsers: number; errors: string[] }> {
    const overallResult = {
      totalUsers: userIds.length,
      successfulUsers: 0,
      failedUsers: 0,
      errors: [],
    };

    if (userIds.length === 0) {
      this.logger.warn('No user IDs provided for push notifications');
      return overallResult;
    }

    this.logger.log(`Sending push notifications to ${userIds.length} users with payload: ${payload.title}`);

    const promises = userIds.map((userId) =>
      this.sendPushNotification(userId, payload),
    );

    const results = await Promise.allSettled(promises);

    for (let i = 0; i < results.length; i++) {
      const userId = userIds[i];
      const promiseResult = results[i];

      if (promiseResult.status === 'fulfilled') {
        const pushResult = promiseResult.value;
        if (pushResult.success) {
          overallResult.successfulUsers++;
          this.logger.debug(`Push notification succeeded for user ${userId}: ${pushResult.sent} sent`);
        } else {
          overallResult.failedUsers++;
          const errorDetail = pushResult.errors.length > 0 ? pushResult.errors.join(', ') : 'No specific error';
          overallResult.errors.push(`User ${userId}: ${errorDetail}`);
          this.logger.warn(`Push notification failed for user ${userId}: ${errorDetail}`);
        }
      } else {
        overallResult.failedUsers++;
        overallResult.errors.push(`User ${userId}: Promise rejected - ${promiseResult.reason}`);
        this.logger.error(`Push notification promise rejected for user ${userId}:`, promiseResult.reason);
      }
    }

    this.logger.log(`Push notification summary: ${overallResult.successfulUsers}/${overallResult.totalUsers} users successful`);
    
    if (overallResult.failedUsers > 0) {
      this.logger.warn(`Push notification failures for ${overallResult.failedUsers} users: ${overallResult.errors.slice(0, 3).join('; ')}${overallResult.errors.length > 3 ? '...' : ''}`);
    }

    return overallResult;
  }

  async sendEmail(emailData: EmailData): Promise<void> {
    try {
      await this.emailService.sendEmail({
        to: emailData.to,
        subject: emailData.subject,
        template: emailData.template,
        data: emailData.data,
      });
    } catch (error) {
      this.logger.error('Failed to send email:', error);
    }
  }

  async notifyGatePassCreated(gatePassId: string): Promise<void> {
    try {
      const gatePass = await this.prisma.gatePass.findUnique({
        where: { id: gatePassId },
        include: {
          user: {
            select: {
              email: true,
              firstName: true,
              lastName: true,
              employeeCode: true,
            },
          },
          approvals: {
            where: {
              approvalLevel: 1, // Notify first level approvers
            },
            include: {
              approver: {
                select: {
                  email: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
        },
      });

      if (!gatePass) {
        this.logger.warn(`Gate pass not found: ${gatePassId}. Skipping notification.`);
        return;
      }

      this.logger.log(`Sending notifications for gate pass: ${gatePass.passNumber} (${gatePassId})`);

      // Send email notifications to approvers
      for (const approval of gatePass.approvals) {
        if (approval.approver.email) {
          try {
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
            const approvalLink = `${frontendUrl}/gate-pass/${gatePass.id}/approval`;
            
            await this.sendEmail({
              to: approval.approver.email,
              subject: `Yêu cầu duyệt giấy ra vào cổng - ${gatePass.passNumber}`,
              template: 'gate-pass-approval-request',
              data: {
                gatePassId: gatePass.id,
                approverName: `${approval.approver.firstName} ${approval.approver.lastName}`,
                requesterName: `${gatePass.user.firstName} ${gatePass.user.lastName}`,
                employeeCode: gatePass.user.employeeCode,
                passNumber: gatePass.passNumber,
                reason: gatePass.reasonType,
                startDateTime: format(new Date(gatePass.startDateTime), 'dd/MM/yyyy HH:mm'),
                endDateTime: format(new Date(gatePass.endDateTime), 'dd/MM/yyyy HH:mm'),
                approvalLink,
                quickApproveLink: approvalLink,
              },
            });
            this.logger.log(`Email sent to approver: ${approval.approver.email}`);
          } catch (emailError) {
            this.logger.error(`Failed to send email to ${approval.approver.email}:`, emailError);
          }
        } else {
          this.logger.warn(`No email address found for approver: ${approval.approverId}`);
        }
      }

      // Send real-time notifications to approvers
      const approverIds = gatePass.approvals.map(approval => approval.approverId);
      if (this.notificationGateway && approverIds.length > 0) {
        try {
          await this.notificationGateway.notifyGatePassCreated(gatePassId, approverIds, {
            id: gatePass.id,
            passNumber: gatePass.passNumber,
            reasonType: gatePass.reasonType,
            startDateTime: gatePass.startDateTime,
            endDateTime: gatePass.endDateTime,
            user: gatePass.user,
          });
          this.logger.log(`WebSocket notifications sent to ${approverIds.length} approvers`);
        } catch (socketError) {
          this.logger.error('Failed to send WebSocket notifications:', socketError);
        }
      } else if (!this.notificationGateway) {
        this.logger.warn('NotificationGateway not available for WebSocket notifications');
      }

      // Send push notifications to approvers
      if (approverIds.length > 0) {
        const pushPayload: PushNotificationPayload = {
          title: 'Giấy ra vào cổng mới',
          body: `Có yêu cầu giấy ra vào cổng mới cần duyệt từ ${gatePass.user.firstName} ${gatePass.user.lastName}`,
          type: 'gate-pass',
          url: `/gate-pass/${gatePassId}`,
          data: {
            gatePassId: gatePass.id,
            passNumber: gatePass.passNumber,
            type: 'created',
          },
        };

        try {
          const pushResults = await this.sendPushNotificationToUsers(approverIds, pushPayload);
          if (pushResults.successfulUsers > 0) {
            this.logger.log(`Push notifications sent to ${pushResults.successfulUsers}/${pushResults.totalUsers} approvers`);
          }
          if (pushResults.failedUsers > 0) {
            this.logger.error(`Failed to send push notifications to ${pushResults.failedUsers} approvers: ${pushResults.errors.join('; ')}`);
          }
        } catch (pushError) {
          this.logger.error(`Failed to process push notifications for approvers:`, pushError);
        }
      }

      this.logger.log(`All notifications sent for gate pass: ${gatePassId}`);
    } catch (error) {
      this.logger.error(`Failed to send gate pass creation notification for ${gatePassId}:`, error);
      // Don't re-throw to prevent transaction rollback
    }
  }

  async notifyGatePassApproved(gatePassId: string): Promise<void> {
    try {
      const gatePass = await this.prisma.gatePass.findUnique({
        where: { id: gatePassId },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      if (!gatePass) {
        this.logger.warn(`Gate pass not found: ${gatePassId}. Skipping notification.`);
        return;
      }

      if (!gatePass.user.email) {
        this.logger.warn(`No email address for user: ${gatePass.user.id}`);
        return;
      }

      // Send email notification
      try {
        await this.sendEmail({
          to: gatePass.user.email,
          subject: `Giấy ra vào cổng đã được duyệt - ${gatePass.passNumber}`,
          template: 'gate-pass-approved',
          data: {
            gatePassId: gatePass.id,
            userName: `${gatePass.user.firstName} ${gatePass.user.lastName}`,
            passNumber: gatePass.passNumber,
            startDateTime: format(new Date(gatePass.startDateTime), 'dd/MM/yyyy HH:mm'),
            endDateTime: format(new Date(gatePass.endDateTime), 'dd/MM/yyyy HH:mm'),
          },
        });
        this.logger.log(`Approval email sent to: ${gatePass.user.email}`);
      } catch (emailError) {
        this.logger.error(`Failed to send approval email to ${gatePass.user.email}:`, emailError);
      }

      // Send real-time notification
      if (this.notificationGateway) {
        try {
          await this.notificationGateway.notifyGatePassApproved(gatePass.user.id, {
            id: gatePass.id,
            passNumber: gatePass.passNumber,
            status: gatePass.status,
          });
          this.logger.log(`Approval WebSocket notification sent to user: ${gatePass.user.id}`);
        } catch (socketError) {
          this.logger.error('Failed to send approval WebSocket notification:', socketError);
        }
      }

      // Send push notification to user
      const pushPayload: PushNotificationPayload = {
        title: 'Giấy ra vào cổng đã được duyệt',
        body: `Giấy ra vào cổng ${gatePass.passNumber} của bạn đã được duyệt`,
        type: 'gate-pass',
        url: `/gate-pass/${gatePassId}`,
        data: {
          gatePassId: gatePass.id,
          passNumber: gatePass.passNumber,
          type: 'approved',
        },
      };

      try {
        const pushResult = await this.sendPushNotification(gatePass.user.id, pushPayload);
        if (pushResult.success) {
          this.logger.log(`Push notification sent to user: ${gatePass.user.id} (${pushResult.sent} sent, ${pushResult.failed} failed)`);
        } else {
          this.logger.error(`Failed to send push notification to user ${gatePass.user.id}: ${pushResult.errors.join(', ')}`);
        }
      } catch (pushError) {
        this.logger.error(`Error processing push notification for user ${gatePass.user.id}:`, pushError);
      }

      this.logger.log(`Approval notification completed for gate pass: ${gatePassId}.`);
    } catch (error) {
      this.logger.error(`Failed to send gate pass approval notification for ${gatePassId}:`, error);
    }
  }

  async notifyGatePassRejected(gatePassId: string, rejectionReason?: string): Promise<void> {
    try {
      const gatePass = await this.prisma.gatePass.findUnique({
        where: { id: gatePassId },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      if (!gatePass || !gatePass.user.email) {
        return;
      }

      await this.sendEmail({
        to: gatePass.user.email,
        subject: `Giấy ra vào cổng bị từ chối - ${gatePass.passNumber}`,
        template: 'gate-pass-rejected',
        data: {
          gatePassId: gatePass.id,
          userName: `${gatePass.user.firstName} ${gatePass.user.lastName}`,
          passNumber: gatePass.passNumber,
          rejectionReason,
          startDateTime: format(new Date(gatePass.startDateTime), 'dd/MM/yyyy HH:mm'),
          endDateTime: format(new Date(gatePass.endDateTime), 'dd/MM/yyyy HH:mm'),
        },
      });

      // Send real-time notification
      if (this.notificationGateway) {
        await this.notificationGateway.notifyGatePassRejected(gatePass.user.id, {
          id: gatePass.id,
          passNumber: gatePass.passNumber,
          status: gatePass.status,
        }, rejectionReason);
      }

      this.logger.log(`Rejection notification sent for gate pass: ${gatePassId}`);
    } catch (error) {
      this.logger.error(`Failed to send gate pass rejection notification: ${error.message}`);
    }
  }

  async notifyGatePassExpiringSoon(gatePassId: string): Promise<void> {
    try {
      const gatePass = await this.prisma.gatePass.findUnique({
        where: { id: gatePassId },
        include: {
          user: {
            select: {
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      if (!gatePass || !gatePass.user.email) {
        return;
      }

      await this.sendEmail({
        to: gatePass.user.email,
        subject: `Giấy ra vào cổng sắp hết hạn - ${gatePass.passNumber}`,
        template: 'gate-pass-expiring',
        data: {
          userName: `${gatePass.user.firstName} ${gatePass.user.lastName}`,
          passNumber: gatePass.passNumber,
          endDateTime: format(new Date(gatePass.endDateTime), 'dd/MM/yyyy HH:mm'),
        },
      });

      this.logger.log(`Expiration notification sent for gate pass: ${gatePassId}`);
    } catch (error) {
      this.logger.error(`Failed to send gate pass expiration notification: ${error.message}`);
    }
  }

  async notifyNextApprovalLevel(gatePassId: string): Promise<void> {
    try {
      const gatePass = await this.prisma.gatePass.findUnique({
        where: { id: gatePassId },
        include: {
          user: {
            select: {
              email: true,
              firstName: true,
              lastName: true,
              employeeCode: true,
            },
          },
          approvals: {
            where: {
              status: 'PENDING',
            },
            include: {
              approver: {
                select: {
                  email: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
            orderBy: {
              approvalLevel: 'asc',
            },
            take: 1, // Get the next pending approval
          },
        },
      });

      if (!gatePass || gatePass.approvals.length === 0) {
        return;
      }

      const nextApproval = gatePass.approvals[0];
      if (!nextApproval.approver.email) {
        return;
      }

      // Send email notification to the next approver
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const approvalLink = `${frontendUrl}/gate-pass/${gatePass.id}/approval`;

      await this.sendEmail({
        to: nextApproval.approver.email,
        subject: `Yêu cầu duyệt giấy ra vào cổng - ${gatePass.passNumber}`,
        template: 'gate-pass-approval-request',
        data: {
          gatePassId: gatePass.id,
          approverName: `${nextApproval.approver.firstName} ${nextApproval.approver.lastName}`,
          requesterName: `${gatePass.user.firstName} ${gatePass.user.lastName}`,
          employeeCode: gatePass.user.employeeCode,
          passNumber: gatePass.passNumber,
          reason: gatePass.reasonType,
          startDateTime: format(new Date(gatePass.startDateTime), 'dd/MM/yyyy HH:mm'),
          endDateTime: format(new Date(gatePass.endDateTime), 'dd/MM/yyyy HH:mm'),
          approvalLink,
          quickApproveLink: approvalLink,
        },
      });

      // Send real-time notification to the next approver
      if (this.notificationGateway) {
        await this.notificationGateway.notifyGatePassCreated(gatePassId, [nextApproval.approverId], {
          id: gatePass.id,
          passNumber: gatePass.passNumber,
          reasonType: gatePass.reasonType,
          startDateTime: gatePass.startDateTime,
          endDateTime: gatePass.endDateTime,
          user: gatePass.user,
        });
      }

      this.logger.log(`Next level approval notification sent for gate pass: ${gatePassId}`);
    } catch (error) {
      this.logger.error(`Failed to send next level approval notification: ${error.message}`);
    }
  }

  async notifyGatePassDeleted(gatePassId: string, approverIds: string[], gatePassData: any): Promise<void> {
    try {
      this.logger.log(`Sending deletion notifications for gate pass: ${gatePassData.passNumber} (${gatePassId})`);

      // Send real-time notifications to approvers that the gate pass has been deleted
      if (this.notificationGateway && approverIds.length > 0) {
        try {
          await this.notificationGateway.notifyGatePassDeleted(gatePassId, approverIds, gatePassData);
          this.logger.log(`WebSocket deletion notifications sent to ${approverIds.length} approvers`);
        } catch (socketError) {
          this.logger.error('Failed to send WebSocket deletion notifications:', socketError);
        }
      }

      this.logger.log(`Deletion notifications completed for gate pass: ${gatePassId}`);
    } catch (error) {
      this.logger.error(`Failed to send gate pass deletion notification for ${gatePassId}:`, error);
    }
  }

  async notifyGatePassUpdated(
    gatePassId: string, 
    gatePassData: any,
    approverIds: string[]
  ): Promise<void> {
    try {
      // Send real-time WebSocket notification to all approvers
      if (this.notificationGateway && approverIds.length > 0) {
        try {
          await this.notificationGateway.notifyGatePassUpdated(gatePassId, approverIds, {
            id: gatePassData.id,
            passNumber: gatePassData.passNumber,
            reasonType: gatePassData.reasonType,
            reasonDetail: gatePassData.reasonDetail,
            startDateTime: gatePassData.startDateTime,
            endDateTime: gatePassData.endDateTime,
            status: gatePassData.status,
            user: {
              name: `${gatePassData.user.firstName} ${gatePassData.user.lastName}`,
              employeeCode: gatePassData.user.employeeCode
            }
          });
          this.logger.log(`WebSocket update notifications sent to ${approverIds.length} approvers for gate pass: ${gatePassId}`);
        } catch (socketError) {
          this.logger.error('Failed to send WebSocket update notifications:', socketError);
        }
      }

      this.logger.log(`Update notifications completed for gate pass: ${gatePassId}`);
    } catch (error) {
      this.logger.error(`Failed to send gate pass update notification for ${gatePassId}:`, error);
    }
  }

  async notifyGatePassCancellationRequested(
    gatePassId: string,
    requester: { firstName: string; lastName: string; email: string },
    approver: { id: string; firstName: string; lastName: string; email: string },
    reason: string
  ): Promise<void> {
    try {
      // Get gate pass details
      const gatePass = await this.prisma.gatePass.findUnique({
        where: { id: gatePassId },
        select: {
          id: true,
          passNumber: true,
          reasonType: true,
          reasonDetail: true,
          startDateTime: true,
          endDateTime: true
        }
      });

      if (!gatePass) {
        this.logger.error(`Gate pass not found: ${gatePassId}`);
        return;
      }

      // Send email notification to approver
      if (approver.email) {
        try {
          await this.sendEmail({
            to: approver.email,
            subject: `Yêu cầu hủy giấy ra vào cổng - ${gatePass.passNumber}`,
            template: 'gate-pass-cancellation-request',
            data: {
              approverName: `${approver.firstName} ${approver.lastName}`,
              requesterName: `${requester.firstName} ${requester.lastName}`,
              passNumber: gatePass.passNumber,
              reason: gatePass.reasonType,
              cancellationReason: reason,
              startDateTime: format(new Date(gatePass.startDateTime), 'dd/MM/yyyy HH:mm'),
              endDateTime: format(new Date(gatePass.endDateTime), 'dd/MM/yyyy HH:mm'),
              gatePassId: gatePass.id,
            },
          });
          this.logger.log(`Cancellation request email sent to approver: ${approver.email}`);
        } catch (emailError) {
          this.logger.error(`Failed to send cancellation request email to ${approver.email}:`, emailError);
        }
      }

      // Send real-time WebSocket notification
      if (this.notificationGateway) {
        try {
          await this.notificationGateway.notifyGatePassCancellationRequested(gatePassId, [approver.id], {
            id: gatePass.id,
            passNumber: gatePass.passNumber,
            requester: {
              name: `${requester.firstName} ${requester.lastName}`,
              email: requester.email
            },
            reason: reason,
            startDateTime: gatePass.startDateTime,
            endDateTime: gatePass.endDateTime
          });
          this.logger.log(`WebSocket cancellation request notification sent to approver: ${approver.firstName} ${approver.lastName}`);
        } catch (socketError) {
          this.logger.error('Failed to send WebSocket cancellation request notification:', socketError);
        }
      }

      // Send push notification to approver
      const pushPayload: PushNotificationPayload = {
        title: 'Yêu cầu hủy giấy ra vào cổng',
        body: `${requester.firstName} ${requester.lastName} yêu cầu hủy giấy ra vào cổng ${gatePass.passNumber}`,
        type: 'gate-pass',
        url: `/gate-pass?filter=cancellation-requests`,
        data: {
          gatePassId: gatePass.id,
          passNumber: gatePass.passNumber,
          type: 'GATE_PASS_CANCELLATION_REQUESTED',
          requesterName: `${requester.firstName} ${requester.lastName}`,
          reason: reason
        },
      };

      try {
        const pushResult = await this.sendPushNotification(approver.id, pushPayload);
        if (pushResult.success) {
          this.logger.log(`Cancellation request push notification sent to approver: ${approver.id} (${pushResult.sent} sent, ${pushResult.failed} failed)`);
        } else {
          this.logger.error(`Failed to send cancellation request push notification to approver ${approver.id}: ${pushResult.errors.join(', ')}`);
        }
      } catch (pushError) {
        this.logger.error(`Error processing cancellation request push notification for approver ${approver.id}:`, pushError);
      }

      this.logger.log(`Cancellation request notifications completed for gate pass: ${gatePassId}`);
    } catch (error) {
      this.logger.error(`Failed to send gate pass cancellation request notification for ${gatePassId}:`, error);
    }
  }

  async notifyGatePassCancellationApproved(
    gatePassId: string,
    requester: { id: string; firstName: string; lastName: string; email: string },
    approver: { id: string; firstName: string; lastName: string; email: string },
    comment?: string
  ): Promise<void> {
    try {
      // Get gate pass details
      const gatePass = await this.prisma.gatePass.findUnique({
        where: { id: gatePassId },
        select: {
          id: true,
          passNumber: true,
          reasonType: true,
          reasonDetail: true,
          startDateTime: true,
          endDateTime: true
        }
      });

      if (!gatePass) {
        this.logger.error(`Gate pass not found: ${gatePassId}`);
        return;
      }

      // Send email notification to requester
      if (requester.email) {
        try {
          await this.sendEmail({
            to: requester.email,
            subject: `Yêu cầu hủy giấy ra vào cổng đã được phê duyệt - ${gatePass.passNumber}`,
            template: 'gate-pass-cancellation-approved',
            data: {
              requesterName: `${requester.firstName} ${requester.lastName}`,
              approverName: `${approver.firstName} ${approver.lastName}`,
              passNumber: gatePass.passNumber,
              reason: gatePass.reasonType,
              comment: comment || 'Không có ghi chú',
              startDateTime: format(new Date(gatePass.startDateTime), 'dd/MM/yyyy HH:mm'),
              endDateTime: format(new Date(gatePass.endDateTime), 'dd/MM/yyyy HH:mm'),
              gatePassId: gatePass.id,
            },
          });
          this.logger.log(`Cancellation approved email sent to requester: ${requester.email}`);
        } catch (emailError) {
          this.logger.error(`Failed to send cancellation approved email to ${requester.email}:`, emailError);
        }
      }

      // Send real-time WebSocket notification
      if (this.notificationGateway) {
        try {
          await this.notificationGateway.notifyGatePassCancellationApproved?.(gatePassId, [requester.id], {
            id: gatePass.id,
            passNumber: gatePass.passNumber,
            approver: {
              name: `${approver.firstName} ${approver.lastName}`
            },
            comment: comment || 'Không có ghi chú',
            startDateTime: gatePass.startDateTime,
            endDateTime: gatePass.endDateTime
          });
          this.logger.log(`WebSocket cancellation approved notification sent to requester: ${requester.firstName} ${requester.lastName}`);
        } catch (socketError) {
          this.logger.error('Failed to send WebSocket cancellation approved notification:', socketError);
        }
      }

      // Send push notification to requester
      const pushPayload: PushNotificationPayload = {
        title: 'Yêu cầu hủy được phê duyệt',
        body: `Yêu cầu hủy giấy ra vào cổng ${gatePass.passNumber} của bạn đã được phê duyệt`,
        type: 'gate-pass',
        url: `/gate-pass/${gatePassId}`,
        data: {
          gatePassId: gatePass.id,
          passNumber: gatePass.passNumber,
          type: 'GATE_PASS_CANCELLATION_APPROVED',
          approverName: `${approver.firstName} ${approver.lastName}`,
          comment: comment || 'Không có ghi chú'
        },
      };

      try {
        const pushResult = await this.sendPushNotification(requester.id, pushPayload);
        if (pushResult.success) {
          this.logger.log(`Cancellation approved push notification sent to requester: ${requester.id} (${pushResult.sent} sent, ${pushResult.failed} failed)`);
        } else {
          this.logger.error(`Failed to send cancellation approved push notification to requester ${requester.id}: ${pushResult.errors.join(', ')}`);
        }
      } catch (pushError) {
        this.logger.error(`Error processing cancellation approved push notification for requester ${requester.id}:`, pushError);
      }

      this.logger.log(`Cancellation approved notifications completed for gate pass: ${gatePassId}`);
    } catch (error) {
      this.logger.error(`Failed to send gate pass cancellation approved notification for ${gatePassId}:`, error);
    }
  }

  async notifyGatePassCancellationRejected(
    gatePassId: string,
    requester: { id: string; firstName: string; lastName: string; email: string },
    approver: { id: string; firstName: string; lastName: string; email: string },
    comment?: string
  ): Promise<void> {
    try {
      // Get gate pass details
      const gatePass = await this.prisma.gatePass.findUnique({
        where: { id: gatePassId },
        select: {
          id: true,
          passNumber: true,
          reasonType: true,
          reasonDetail: true,
          startDateTime: true,
          endDateTime: true
        }
      });

      if (!gatePass) {
        this.logger.error(`Gate pass not found: ${gatePassId}`);
        return;
      }

      // Send email notification to requester
      if (requester.email) {
        try {
          await this.sendEmail({
            to: requester.email,
            subject: `Yêu cầu hủy giấy ra vào cổng bị từ chối - ${gatePass.passNumber}`,
            template: 'gate-pass-cancellation-rejected',
            data: {
              requesterName: `${requester.firstName} ${requester.lastName}`,
              approverName: `${approver.firstName} ${approver.lastName}`,
              passNumber: gatePass.passNumber,
              reason: gatePass.reasonType,
              comment: comment || 'Không có lý do cụ thể',
              startDateTime: format(new Date(gatePass.startDateTime), 'dd/MM/yyyy HH:mm'),
              endDateTime: format(new Date(gatePass.endDateTime), 'dd/MM/yyyy HH:mm'),
              gatePassId: gatePass.id,
            },
          });
          this.logger.log(`Cancellation rejected email sent to requester: ${requester.email}`);
        } catch (emailError) {
          this.logger.error(`Failed to send cancellation rejected email to ${requester.email}:`, emailError);
        }
      }

      // Send real-time WebSocket notification
      if (this.notificationGateway) {
        try {
          await this.notificationGateway.notifyGatePassCancellationRejected?.(gatePassId, [requester.id], {
            id: gatePass.id,
            passNumber: gatePass.passNumber,
            approver: {
              name: `${approver.firstName} ${approver.lastName}`
            },
            comment: comment || 'Không có lý do cụ thể',
            startDateTime: gatePass.startDateTime,
            endDateTime: gatePass.endDateTime
          });
          this.logger.log(`WebSocket cancellation rejected notification sent to requester: ${requester.firstName} ${requester.lastName}`);
        } catch (socketError) {
          this.logger.error('Failed to send WebSocket cancellation rejected notification:', socketError);
        }
      }

      // Send push notification to requester
      const pushPayload: PushNotificationPayload = {
        title: 'Yêu cầu hủy bị từ chối',
        body: `Yêu cầu hủy giấy ra vào cổng ${gatePass.passNumber} của bạn đã bị từ chối`,
        type: 'gate-pass',
        url: `/gate-pass/${gatePassId}`,
        data: {
          gatePassId: gatePass.id,
          passNumber: gatePass.passNumber,
          type: 'GATE_PASS_CANCELLATION_REJECTED',
          approverName: `${approver.firstName} ${approver.lastName}`,
          comment: comment || 'Không có lý do cụ thể'
        },
      };

      try {
        const pushResult = await this.sendPushNotification(requester.id, pushPayload);
        if (pushResult.success) {
          this.logger.log(`Cancellation rejected push notification sent to requester: ${requester.id} (${pushResult.sent} sent, ${pushResult.failed} failed)`);
        } else {
          this.logger.error(`Failed to send cancellation rejected push notification to requester ${requester.id}: ${pushResult.errors.join(', ')}`);
        }
      } catch (pushError) {
        this.logger.error(`Error processing cancellation rejected push notification for requester ${requester.id}:`, pushError);
      }

      this.logger.log(`Cancellation rejected notifications completed for gate pass: ${gatePassId}`);
    } catch (error) {
      this.logger.error(`Failed to send gate pass cancellation rejected notification for ${gatePassId}:`, error);
    }
  }

  // Helper method to render email templates (placeholder for now)
  private renderTemplate(template: string, data: Record<string, any>): string {
    // TODO: Implement template rendering with handlebars or similar
    return `Template: ${template}, Data: ${JSON.stringify(data)}`;
  }

  /**
   * Health check for push notification service
   */
  async checkPushNotificationHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: string;
    subscriptionCount?: number;
    vapidConfigured?: boolean;
  }> {
    try {
      // Check VAPID configuration - service should be functional even with default keys
      const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || 'BI8AJsdXH6j4GnERi-vfMif-R1BrTuLPTu2q-24fSq6yvotc6A6lMo1Nq2Sqk0PZUhSTxGHRBS4WObIT7at4xV4';
      const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || 'FtfI4VCSTUw8xg4MqzqzgJy6y0DZ-pJmkSHDrthBQ58';
      const hasEnvironmentKeys = !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
      
      // Validate that keys are present (either from environment or defaults)
      const vapidConfigured = !!(vapidPublicKey && vapidPrivateKey && vapidPublicKey.length > 10 && vapidPrivateKey.length > 10);
      
      // Check subscription count
      const subscriptionCount = await this.prisma.pushSubscription.count();
      
      // Determine status based on configuration and functionality
      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      let details = 'Push notification service is operational';
      
      if (!vapidConfigured) {
        status = 'unhealthy';
        details = 'VAPID keys are invalid or missing';
      } else if (!hasEnvironmentKeys) {
        status = 'degraded';
        details = 'Using default VAPID keys (not recommended for production)';
      } else if (subscriptionCount === 0) {
        // Service is healthy but no users have subscribed yet
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

  /**
   * Clean up invalid push subscriptions periodically
   */
  async cleanupInvalidSubscriptions(): Promise<{ removedCount: number; errors: string[] }> {
    const result = { removedCount: 0, errors: [] };
    
    try {
      // Remove subscriptions older than 90 days that haven't been updated
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 90);

      const oldSubscriptions = await this.prisma.pushSubscription.deleteMany({
        where: {
          updatedAt: {
            lt: cutoffDate,
          },
        },
      });

      result.removedCount = oldSubscriptions.count;
      this.logger.log(`Cleaned up ${oldSubscriptions.count} old push subscriptions`);
      
      return result;
    } catch (error) {
      this.logger.error('Failed to cleanup push subscriptions:', error);
      result.errors.push(`Cleanup failed: ${error.message}`);
      return result;
    }
  }

  /**
   * Get push notification statistics
   */
  async getPushNotificationStats(): Promise<{
    totalSubscriptions: number;
    subscriptionsByUser: number;
    recentSubscriptions: number;
    oldestSubscription?: Date;
    newestSubscription?: Date;
  }> {
    try {
      const [
        totalSubscriptions,
        subscriptionsByUser,
        recentSubscriptions,
        oldest,
        newest
      ] = await Promise.all([
        this.prisma.pushSubscription.count(),
        this.prisma.pushSubscription.groupBy({
          by: ['userId'],
          _count: true,
        }).then(results => results.length),
        this.prisma.pushSubscription.count({
          where: {
            createdAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
            },
          },
        }),
        this.prisma.pushSubscription.findFirst({
          orderBy: { createdAt: 'asc' },
          select: { createdAt: true },
        }),
        this.prisma.pushSubscription.findFirst({
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        }),
      ]);

      return {
        totalSubscriptions,
        subscriptionsByUser,
        recentSubscriptions,
        oldestSubscription: oldest?.createdAt,
        newestSubscription: newest?.createdAt,
      };
    } catch (error) {
      this.logger.error('Failed to get push notification stats:', error);
      return {
        totalSubscriptions: 0,
        subscriptionsByUser: 0,
        recentSubscriptions: 0,
      };
    }
  }
}