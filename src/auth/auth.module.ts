import { Module } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { EnvironmentConfig } from '../config/config.environment';
import { PermissionsService } from '../common/permissions.service';
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
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    JwtService,
  ],
  exports: [AuthService, JwtService],
})
export class AuthModule {}
