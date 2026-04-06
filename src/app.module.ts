import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';

import { ConfigModule } from '@nestjs/config';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { ManufacturingModule } from './modules/manufacturing/manufacturing.module';
import { WorksheetModule } from './modules/worksheet/worksheet.module';
import { WebSocketModule } from './modules/websocket/websocket.module';
import { HealthcareModule } from './healthcare/healthcare.module';
import { FeedbackModule } from './feedback/feedback.module'; // ⭐ NEW
import { LeaveModule } from './modules/leave/leave.module'; // ⭐ LEAVE MANAGEMENT

// ✅ New consolidated modules
import { OrganizationModule } from './modules/organization/organization.module';
import { ProductionModule } from './modules/production/production.module';
import { CompanyModule } from './modules/company/company.module';
import { CommonModule } from './common/common.module'; // ⭐ ADD

@Module({
  imports: [
    // ⭐ FIX: ConfigModule setup
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    CommonModule, // ⭐ ADD

    // Enable cron jobs for scheduled tasks
    ScheduleModule.forRoot(),

    // Conditionally serve static files only in development
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'uploads'),
      serveRoot: '/uploads',
      exclude: ['/api*'],
    }),

    // Serve public files only in development
    ...(process.env.NODE_ENV !== 'production'
      ? [
          ServeStaticModule.forRoot({
            rootPath: join(__dirname, '..', 'public'),
            serveRoot: '/',
            exclude: ['/api*'],
          }),
        ]
      : []),

    // Feature modules
    AuthModule,
    UsersModule,
    ManufacturingModule,
    WorksheetModule,
    WebSocketModule,
    HealthcareModule,
    FeedbackModule, // ⭐ NEW
    LeaveModule,    // ⭐ LEAVE MANAGEMENT

    // ✅ New consolidated modules (Use these for new development)
    OrganizationModule,
    ProductionModule,
    CompanyModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // PrismaService,
    // EnvironmentConfig,
    // CloudflareR2Service, // Replace FirebaseService with CloudflareR2Service
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // PermissionsGuard runs after JwtAuthGuard; passes through if no @RequirePermissions
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
  exports: [],
})
export class AppModule {}
