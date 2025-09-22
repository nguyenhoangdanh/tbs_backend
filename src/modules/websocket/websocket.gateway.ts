import {
  WebSocketGateway as NestWebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards, Logger } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtService } from '@nestjs/jwt';

@NestWebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
})
export class WebSocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WebSocketGateway.name);
  private connectedUsers = new Map<string, { socketId: string; userId: string }>(); // socketId -> user info

  constructor(private jwtService: JwtService) {}

  async handleConnection(client: Socket) {
    try {
      // Extract token from auth or query
      const token = client.handshake.auth?.token || client.handshake.query?.token;
      
      if (!token) {
        this.logger.warn(`Client ${client.id} connected without token`);
        client.emit('error', { message: 'Authentication required' });
        client.disconnect();
        return;
      }

      // Verify JWT token
      const payload = this.jwtService.verify(token);
      const userId = payload.sub;
      
      if (!userId) {
        this.logger.warn(`Client ${client.id} connected with invalid token payload`);
        client.emit('error', { message: 'Invalid token' });
        client.disconnect();
        return;
      }
      
      // Store client connection
      this.connectedUsers.set(client.id, { socketId: client.id, userId });
      
      // Join user-specific room for notifications
      await client.join(`user_${userId}`);
      
      this.logger.log(`✅ Client ${client.id} connected for user ${userId}`);
      
      // Send connection confirmation
      client.emit('connected', { 
        message: 'Connected to WebSocket',
        userId,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      this.logger.error(`❌ WebSocket authentication failed for client ${client.id}:`, error.message);
      client.emit('unauthorized', { message: 'Authentication failed' });
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const connection = this.connectedUsers.get(client.id);
    if (connection) {
      this.logger.log(`Client ${client.id} (user ${connection.userId}) disconnected`);
      this.connectedUsers.delete(client.id);
    }
  }

  @SubscribeMessage('join-worksheet')
  handleJoinWorksheet(@ConnectedSocket() client: Socket, @MessageBody() worksheetId: string) {
    client.join(`worksheet-${worksheetId}`);
    this.logger.debug(`Client ${client.id} joined worksheet room: ${worksheetId}`);
  }

  @SubscribeMessage('leave-worksheet')
  handleLeaveWorksheet(@ConnectedSocket() client: Socket, @MessageBody() worksheetId: string) {
    client.leave(`worksheet-${worksheetId}`);
    this.logger.debug(`Client ${client.id} left worksheet room: ${worksheetId}`);
  }

  @SubscribeMessage('join-gate-pass')
  handleJoinGatePass(@ConnectedSocket() client: Socket, @MessageBody() gatePassId: string) {
    client.join(`gate-pass-${gatePassId}`);
    this.logger.debug(`Client ${client.id} joined gate pass room: ${gatePassId}`);
  }

  @SubscribeMessage('leave-gate-pass')
  handleLeaveGatePass(@ConnectedSocket() client: Socket, @MessageBody() gatePassId: string) {
    client.leave(`gate-pass-${gatePassId}`);
    this.logger.debug(`Client ${client.id} left gate pass room: ${gatePassId}`);
  }

  // Broadcast worksheet updates
  broadcastWorksheetUpdate(worksheetId: string, data: any) {
    this.server.to(`worksheet-${worksheetId}`).emit('worksheet-updated', data);
    this.logger.debug(`Worksheet update broadcasted to room: worksheet-${worksheetId}`);
  }

  // Broadcast factory dashboard updates
  broadcastFactoryUpdate(factoryId: string, data: any) {
    this.server.to(`factory-${factoryId}`).emit('factory-updated', data);
    this.logger.debug(`Factory update broadcasted to room: factory-${factoryId}`);
  }

  // Broadcast gate pass updates
  broadcastGatePassUpdate(gatePassId: string, data: any) {
    this.server.to(`gate-pass-${gatePassId}`).emit('gate-pass-updated', data);
    this.logger.debug(`Gate pass update broadcasted to room: gate-pass-${gatePassId}`);
  }

  // Send notification to specific user
  sendNotification(userId: string, notification: any) {
    this.server.to(`user_${userId}`).emit('notification', notification);
    this.logger.debug(`Notification sent to user ${userId}:`, notification);
  }

  // Send notification to multiple users
  sendNotificationToUsers(userIds: string[], notification: any) {
    userIds.forEach(userId => {
      this.sendNotification(userId, notification);
    });
  }

  // Broadcast gate pass notifications to relevant users
  broadcastGatePassNotification(notification: any, targetUserIds?: string[]) {
    if (targetUserIds && targetUserIds.length > 0) {
      this.sendNotificationToUsers(targetUserIds, notification);
    } else {
      // Broadcast to all connected users if no specific targets
      this.server.emit('notification', notification);
    }
    this.logger.debug('Gate pass notification broadcasted:', notification);
  }

  // Get connected user count
  getConnectedUserCount(): number {
    return this.connectedUsers.size;
  }

  // Check if user is connected
  isUserConnected(userId: string): boolean {
    return Array.from(this.connectedUsers.values()).some(conn => conn.userId === userId);
  }
}
