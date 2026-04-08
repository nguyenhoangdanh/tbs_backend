import { Module } from '@nestjs/common';
import { GatePassController } from './controllers/gate-pass.controller';
import { GatePassService } from './services/gate-pass.service';
import { CommonModule } from 'src/common/common.module';
import { WebSocketModule } from '../websocket/websocket.module';

@Module({
  imports: [CommonModule, WebSocketModule],
  controllers: [GatePassController],
  providers: [GatePassService],
  exports: [GatePassService],
})
export class GatePassModule {}
