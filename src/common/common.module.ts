import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { PermissionsService } from './permissions.service';
import { RolesService } from './roles.service';
import { PermissionsGuard } from './guards/permissions.guard';
import { RolesGuard } from './guards/roles.guard';
import { RolesController } from './roles.controller';
import { EnvironmentConfig } from '../config/config.environment'; // ⭐ ADD
import { CloudflareR2Service } from './r2.service'; // ⭐ ADD

@Module({
  controllers: [RolesController],
  providers: [
    PrismaService,
    PermissionsService,
    RolesService,
    PermissionsGuard,
    RolesGuard,
    EnvironmentConfig, // ⭐ ADD
    CloudflareR2Service, // ⭐ ADD
  ],
  exports: [
    PrismaService,
    PermissionsService,
    RolesService,
    PermissionsGuard,
    RolesGuard,
    EnvironmentConfig, // ⭐ ADD
    CloudflareR2Service, // ⭐ ADD
  ],
})
export class CommonModule {}
