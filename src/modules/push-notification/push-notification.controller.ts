import { Controller, Post, Delete, Get, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { PushNotificationService, PushSubscriptionDto } from './push-notification.service';

@Controller('push')
export class PushNotificationController {
  constructor(private readonly service: PushNotificationService) {}

  @Public()
  @Get('vapid-public-key')
  getVapidPublicKey() {
    return { publicKey: this.service.getVapidPublicKey() };
  }

  @Post('subscribe')
  @UseGuards(JwtAuthGuard)
  subscribe(@GetUser('id') userId: string, @Body() dto: PushSubscriptionDto) {
    return this.service.subscribe(userId, dto);
  }

  @Delete('unsubscribe')
  @UseGuards(JwtAuthGuard)
  unsubscribe(@GetUser('id') userId: string, @Body() body: { endpoint: string }) {
    return this.service.unsubscribe(userId, body.endpoint);
  }
}
