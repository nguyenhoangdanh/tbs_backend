import { Module } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { PrismaService } from '../common/prisma.service';
import { EnvironmentConfig } from '../config/config.environment';

@Module({
  imports: [
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
    PrismaService, 
    EnvironmentConfig,
    JwtService, // ✅ Add JwtService to providers explicitly
  ],
  exports: [AuthService, EnvironmentConfig, JwtService] // ✅ Export JwtService
})
export class AuthModule {}

