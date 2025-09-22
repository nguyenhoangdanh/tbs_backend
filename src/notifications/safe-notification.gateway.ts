import { Injectable, Logger } from '@nestjs/common';

export interface NotificationPayload {
  type: 'GATE_PASS_CREATED' | 'GATE_PASS_APPROVED' | 'GATE_PASS_REJECTED' | 'GATE_PASS_PENDING_APPROVAL';
  title: string;
  message: string;
  data?: any;
  userId?: string;
  timestamp: Date;
}

@Injectable()
export class SafeNotificationGateway {
  private readonly logger = new Logger(SafeNotificationGateway.name);

  constructor() {
    this.logger.log('SafeNotificationGateway initialized (WebSocket disabled for now)');
  }

  // Mock methods for compatibility - will not cause any errors
  async sendToUser(userId: string, notification: NotificationPayload): Promise<void> {
    this.logger.log(`[MOCK] Notification sent to user ${userId}: ${notification.type}`);
    this.logger.debug(`[MOCK] Message: ${notification.message}`);
  }

  async sendToDepartment(departmentId: string, notification: NotificationPayload): Promise<void> {
    this.logger.log(`[MOCK] Notification sent to department ${departmentId}: ${notification.type}`);
  }

  async sendToAll(notification: NotificationPayload): Promise<void> {
    this.logger.log(`[MOCK] Broadcast notification: ${notification.type}`);
  }

  async notifyGatePassCreated(gatePassId: string, approverIds: string[], gatePassData: any): Promise<void> {
    const notification: NotificationPayload = {
      type: 'GATE_PASS_PENDING_APPROVAL',
      title: 'Yêu cầu duyệt giấy ra vào cổng',
      message: `${gatePassData.user.firstName} ${gatePassData.user.lastName} đã tạo yêu cầu giấy ra vào cổng`,
      data: {
        gatePassId,
        passNumber: gatePassData.passNumber,
        requester: gatePassData.user,
        reason: gatePassData.reasonType,
        location: gatePassData.location,
        startDateTime: gatePassData.startDateTime,
        endDateTime: gatePassData.endDateTime,
      },
      timestamp: new Date(),
    };

    // Send to each approver (mock)
    for (const approverId of approverIds) {
      await this.sendToUser(approverId, notification);
    }
  }

  async notifyGatePassApproved(userId: string, gatePassData: any): Promise<void> {
    const notification: NotificationPayload = {
      type: 'GATE_PASS_APPROVED',
      title: 'Giấy ra vào cổng đã được duyệt',
      message: `Giấy ra vào cổng ${gatePassData.passNumber} của bạn đã được duyệt`,
      data: {
        gatePassId: gatePassData.id,
        passNumber: gatePassData.passNumber,
        status: gatePassData.status,
      },
      timestamp: new Date(),
    };

    await this.sendToUser(userId, notification);
  }

  async notifyGatePassRejected(userId: string, gatePassData: any, reason?: string): Promise<void> {
    const notification: NotificationPayload = {
      type: 'GATE_PASS_REJECTED',
      title: 'Giấy ra vào cổng bị từ chối',
      message: `Giấy ra vào cổng ${gatePassData.passNumber} của bạn đã bị từ chối`,
      data: {
        gatePassId: gatePassData.id,
        passNumber: gatePassData.passNumber,
        reason,
        status: gatePassData.status,
      },
      timestamp: new Date(),
    };

    await this.sendToUser(userId, notification);
  }
}