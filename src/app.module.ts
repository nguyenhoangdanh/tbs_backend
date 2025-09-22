import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { OfficesModule } from './offices/offices.module';
import { DepartmentsModule } from './departments/departments.module';
import { PositionsModule } from './positions/positions.module';
import { JobPositionsModule } from './job-positions/job-positions.module';
import { ReportsModule } from './reports/reports.module';
import { StatisticsModule } from './statistics/statistics.module';
import { HierarchyReportsModule } from './hierarchy-reports/hierarchy-reports.module';
import { TaskEvaluationsModule } from './task-evaluations/task-evaluations.module';
import { PrismaService } from './common/prisma.service';
import { OrganizationsModule } from './organizations/organizations.module';
import { EnvironmentConfig } from './config/config.environment';
import { ConfigModule } from './config/config.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { CloudflareR2Service } from './common/r2.service';
import { FactoryModule } from './modules/factory/factory.module';
import { LineModule } from './modules/line/line.module';
import { TeamModule } from './modules/team/team.module';
import { GroupModule } from './modules/group/group.module';
import { ManufacturingModule } from './modules/manufacturing/manufacturing.module';
import { WorksheetModule } from './modules/worksheet/worksheet.module';
import { MobileModule } from './modules/mobile/mobile.module';
import { WebSocketModule } from './modules/websocket/websocket.module';
import { GatePassModule } from './gate-pass/gate-pass.module';
import { NotificationModule } from './notifications/notification.module';
import { HealthcareModule } from './healthcare/healthcare.module';

@Module({
  imports: [
    // Global configuration module
    ConfigModule,

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
    OfficesModule,
    DepartmentsModule,
    PositionsModule,
    JobPositionsModule,
    ReportsModule,
    StatisticsModule,
    OrganizationsModule,
    HierarchyReportsModule,
    TaskEvaluationsModule,
    FactoryModule,          // Add new modules
    LineModule,             // Add line module
    TeamModule,             // Add team module
    GroupModule,            // Add group module
    ManufacturingModule,    // Add new modules
    WorksheetModule,        // Add worksheet module
    WebSocketModule,        // Add WebSocket module
    MobileModule,           // Add mobile module
    GatePassModule,         // Add gate pass module
    NotificationModule,     // Add notification module
    HealthcareModule,       // Add healthcare module
  ],
  controllers: [AppController],
  providers: [
    AppService,
    PrismaService,
    EnvironmentConfig,
    CloudflareR2Service, // Replace FirebaseService with CloudflareR2Service
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
  exports: [PrismaService, EnvironmentConfig],
})
export class AppModule {}
