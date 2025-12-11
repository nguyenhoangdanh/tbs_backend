import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

/**
 * ⭐ Worksheet WebSocket Gateway - Real-time updates
 * 
 * Events:
 * - worksheet:updated → Emitted when worksheet data changes
 * - report:refresh → Client requests report refresh
 */
@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/worksheets',
})
export class WorksheetGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger = new Logger('WorksheetGateway');
  private connectedClients = new Map<string, Socket>();

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
    this.connectedClients.set(client.id, client);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    this.connectedClients.delete(client.id);
  }

  /**
   * ⭐ Emit worksheet update event
   * Called after batchUpdateByHour, completeWorksheet, etc.
   */
  emitWorksheetUpdate(data: {
    groupId: string;
    date: string;
    workHour?: number;
    affectedWorkers: number;
  }) {
    this.server.emit('worksheet:updated', {
      timestamp: new Date().toISOString(),
      ...data,
    });
  }

  /**
   * ⭐ Emit report data refresh
   * Called when report needs to be refreshed
   */
  emitReportRefresh(data: {
    date: string;
    officeId?: string;
    departmentId?: string;
    teamId?: string;
    groupId?: string;
    summary: {
      totalPlanned: number;
      totalActual: number;
      averageEfficiency: number;
    };
  }) {
    this.logger.log(`Emitting report refresh: ${data.date}`);
    
    this.server.emit('report:refresh', {
      timestamp: new Date().toISOString(),
      ...data,
    });
  }

  /**
   * ⭐ Subscribe to report room for targeted updates
   */
  @SubscribeMessage('report:subscribe')
  handleReportSubscribe(client: Socket, payload: { date: string; groupId?: string }) {
    const room = `report:${payload.date}:${payload.groupId || 'all'}`;
    client.join(room);
    this.logger.log(`Client ${client.id} subscribed to ${room}`);
    
    return { event: 'report:subscribed', data: { room } };
  }

  /**
   * ⭐ Emit to specific report room
   */
  emitToReportRoom(
    date: string, 
    groupId: string | undefined, 
    event: string, 
    data: any
  ) {
    const room = `report:${date}:${groupId || 'all'}`;
    this.server.to(room).emit(event, {
      timestamp: new Date().toISOString(),
      ...data,
    });
  }
}
