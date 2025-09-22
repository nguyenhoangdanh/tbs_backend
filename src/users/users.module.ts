import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { PrismaService } from '../common/prisma.service';
import { CloudflareR2Service } from '../common/r2.service'; // Replace FirebaseService

@Module({
  controllers: [UsersController],
  providers: [UsersService, PrismaService, CloudflareR2Service], // Add CloudflareR2Service
  exports: [UsersService],
})
export class UsersModule {}
