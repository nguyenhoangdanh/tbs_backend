import { Module } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

// Medicine management modules
import { HealthcareController } from './healthcare.controller';
import { HealthcareService } from './healthcare.service';

// Health profile modules

// Main controllers and services

@Module({
  controllers: [HealthcareController],
  providers: [HealthcareService, PrismaService],
  exports: [HealthcareService],
})
export class HealthcareModule {}