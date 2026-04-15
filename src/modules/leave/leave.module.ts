import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

// Controllers
import { LeaveRequestController } from './controllers/leave-request.controller';
import { LeaveBalanceController } from './controllers/leave-balance.controller';
import { LeaveTypeController } from './controllers/leave-type.controller';
import { LeaveFlowController } from './controllers/leave-flow.controller';
import { LeaveVisibilityController } from './controllers/leave-visibility.controller';
import { PublicHolidayController } from './controllers/public-holiday.controller';

// Services
import { LeaveRequestService } from './services/leave-request.service';
import { LeaveApprovalService } from './services/leave-approval.service';
import { LeaveBalanceService } from './services/leave-balance.service';
import { LeaveTypeService } from './services/leave-type.service';
import { LeaveFlowService } from './services/leave-flow.service';
import { LeaveVisibilityService } from './services/leave-visibility.service';
import { LeaveAccrualService } from './services/leave-accrual.service';
import { PublicHolidayService } from './services/public-holiday.service';
import { WorkingDayService } from './services/working-day.service';

// Common
import { CommonModule } from 'src/common/common.module';
import { WebSocketModule } from '../websocket/websocket.module';

@Module({
  imports: [CommonModule, WebSocketModule],
  controllers: [
    LeaveRequestController,
    LeaveBalanceController,
    LeaveTypeController,
    LeaveFlowController,
    LeaveVisibilityController,
    PublicHolidayController,
  ],
  providers: [
    LeaveRequestService,
    LeaveApprovalService,
    LeaveBalanceService,
    LeaveTypeService,
    LeaveFlowService,
    LeaveVisibilityService,
    LeaveAccrualService,
    PublicHolidayService,
    WorkingDayService,
  ],
  exports: [
    LeaveBalanceService,
    LeaveVisibilityService,
    WorkingDayService,
  ],
})
export class LeaveModule {}
