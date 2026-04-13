import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as webpush from 'web-push';
import { PrismaService } from '../../common/prisma.service';

export interface PushSubscriptionDto {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

@Injectable()
export class PushNotificationService implements OnModuleInit {
  private readonly logger = new Logger(PushNotificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const email = process.env.VAPID_EMAIL || 'mailto:admin@tbs.com';

    if (!publicKey || !privateKey) {
      this.logger.warn('VAPID keys not configured — Web Push disabled');
      return;
    }

    webpush.setVapidDetails(email, publicKey, privateKey);
    this.logger.log('✅ Web Push (VAPID) initialized');
  }

  getVapidPublicKey(): string {
    return process.env.VAPID_PUBLIC_KEY ?? '';
  }

  async subscribe(userId: string, dto: PushSubscriptionDto): Promise<void> {
    await this.prisma.pushSubscription.upsert({
      where: { userId_endpoint: { userId, endpoint: dto.endpoint } },
      create: {
        userId,
        endpoint: dto.endpoint,
        p256dhKey: dto.keys.p256dh,
        authKey: dto.keys.auth,
      },
      update: {
        p256dhKey: dto.keys.p256dh,
        authKey: dto.keys.auth,
      },
    });
  }

  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({
      where: { userId, endpoint },
    });
  }

  async sendToUser(userId: string, payload: { title: string; body: string; tag?: string; url?: string }): Promise<void> {
    if (!process.env.VAPID_PRIVATE_KEY) return;

    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId },
    });

    const message = JSON.stringify({
      title: payload.title,
      body: payload.body,
      tag: payload.tag,
      url: payload.url ?? '/',
      icon: '/icon-192.png',
      badge: '/badge-72.png',
    });

    const failed: string[] = [];
    await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dhKey, auth: sub.authKey } },
            message,
          );
        } catch (err: any) {
          // 410 Gone = subscription expired/revoked — clean up
          if (err.statusCode === 410 || err.statusCode === 404) {
            failed.push(sub.id);
          } else {
            this.logger.warn(`Push failed for user ${userId}: ${err.message}`);
          }
        }
      }),
    );

    if (failed.length > 0) {
      await this.prisma.pushSubscription.deleteMany({ where: { id: { in: failed } } });
    }
  }

  async sendToUsers(userIds: string[], payload: { title: string; body: string; tag?: string; url?: string }): Promise<void> {
    await Promise.allSettled(userIds.map((id) => this.sendToUser(id, payload)));
  }
}
