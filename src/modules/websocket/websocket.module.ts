import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WebSocketGateway } from './websocket.gateway';
import { PushNotificationModule } from '../push-notification/push-notification.module';

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: (config.get<string>('JWT_EXPIRES_IN') || '1d') as any },
      }),
    }),
    forwardRef(() => PushNotificationModule),
  ],
  providers: [WebSocketGateway],
  exports: [WebSocketGateway],
})
export class WebSocketModule {}