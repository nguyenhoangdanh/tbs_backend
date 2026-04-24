import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UserPermissionsService } from './user-permissions.service';
import { CloudflareR2Service } from '../common/r2.service';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [CommonModule],
  controllers: [UsersController],
  providers: [UsersService, UserPermissionsService, CloudflareR2Service],
  exports: [UsersService],
})
export class UsersModule {}
