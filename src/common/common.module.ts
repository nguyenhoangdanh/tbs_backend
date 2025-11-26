import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { PermissionsService } from './permissions.service';
import { PermissionsGuard } from './guards/permissions.guard';
import { RolesGuard } from './guards/roles.guard';
import { EnvironmentConfig } from '../config/config.environment'; // ⭐ ADD
import { CloudflareR2Service } from './r2.service'; // ⭐ ADD

@Module({
  providers: [
    PrismaService,
    PermissionsService,
    PermissionsGuard,
    RolesGuard,
    EnvironmentConfig, // ⭐ ADD
    CloudflareR2Service, // ⭐ ADD
  ],
  exports: [
    PrismaService,
    PermissionsService,
    PermissionsGuard,
    RolesGuard,
    EnvironmentConfig, // ⭐ ADD
    CloudflareR2Service, // ⭐ ADD
  ],
})
export class CommonModule {}
