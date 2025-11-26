import { Module } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { PrismaService } from '../common/prisma.service';
import { EnvironmentConfig } from '../config/config.environment';
import { PermissionsService } from '../common/permissions.service';
import { PermissionsController } from '../common/controllers/permissions.controller';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [
    CommonModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'weekly-report-secret-key-2024',
      signOptions: {
        expiresIn: '7d',
      },
    }),
  ],
  controllers: [AuthController, PermissionsController],
  providers: [
    AuthService,
    JwtStrategy,
    PrismaService,
    EnvironmentConfig,
    JwtService,
    PermissionsService,
    PermissionsGuard,
    RolesGuard,
  ],
  exports: [AuthService, EnvironmentConfig, JwtService, PermissionsService],
})
export class AuthModule {}
