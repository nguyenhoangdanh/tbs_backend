import { Module, Global } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { EnvironmentConfig } from './config.environment';

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        `.env.${process.env.NODE_ENV || 'development'}`,
        '.env.local',
        '.env',
      ],
      expandVariables: true,
      cache: true,
    }),
  ],
  providers: [EnvironmentConfig],
  exports: [EnvironmentConfig],
})
export class ConfigModule {}
