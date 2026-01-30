import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ReportsModule } from './reports/reports.module';
import { StatisticsModule } from './statistics/statistics.module';
import { HierarchyReportsModule } from './hierarchy-reports/hierarchy-reports.module';
import { TaskEvaluationsModule } from './task-evaluations/task-evaluations.module';
import { ConfigModule } from '@nestjs/config'; // ⭐ Ensure correct import
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { ManufacturingModule } from './modules/manufacturing/manufacturing.module';
import { WorksheetModule } from './modules/worksheet/worksheet.module';
import { WebSocketModule } from './modules/websocket/websocket.module';
import { GatePassModule } from './gate-pass/gate-pass.module';
import { NotificationModule } from './notifications/notification.module';
import { HealthcareModule } from './healthcare/healthcare.module';
import { FeedbackModule } from './feedback/feedback.module'; // ⭐ NEW

// ✅ New consolidated modules
import { OrganizationModule } from './modules/organization/organization.module';
import { ProductionModule } from './modules/production/production.module';

// ⚠️ DEPRECATED: These modules are now consolidated into OrganizationModule and ProductionModule
// Keep for backward compatibility, will be removed in next version
import { OfficesModule } from './offices/offices.module';
import { DepartmentsModule } from './departments/departments.module';
import { PositionsModule } from './positions/positions.module';
import { JobPositionsModule } from './job-positions/job-positions.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { CommonModule } from './common/common.module'; // ⭐ ADD

@Module({
  imports: [
    // ⭐ FIX: ConfigModule setup
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
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
    ReportsModule,
    StatisticsModule,
    HierarchyReportsModule,
    TaskEvaluationsModule,
    ManufacturingModule,
    WorksheetModule,
    WebSocketModule,
    GatePassModule,
    NotificationModule,
    HealthcareModule,
    FeedbackModule, // ⭐ NEW

    // ✅ New consolidated modules (Use these for new development)
    OrganizationModule,
    ProductionModule,

    // ⚠️ DEPRECATED: Keep for backward compatibility
    OfficesModule,
    DepartmentsModule,
    PositionsModule,
    JobPositionsModule,
    OrganizationsModule,
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
  ],
  exports: [],
})
export class AppModule {}
