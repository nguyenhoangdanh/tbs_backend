import { Injectable, Logger } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';

export interface NotificationPayload {
  type: 'GATE_PASS_CREATED' | 'GATE_PASS_APPROVED' | 'GATE_PASS_REJECTED' | 'GATE_PASS_PENDING_APPROVAL' | 'GATE_PASS_DELETED' | 'GATE_PASS_CANCELLATION_REQUESTED' | 'GATE_PASS_CANCELLATION_APPROVED' | 'GATE_PASS_CANCELLATION_REJECTED' | 'GATE_PASS_UPDATED';
  title: string;
  message: string;
  data?: any;
  userId?: string; // Target user ID
  timestamp: Date;
}

interface ConnectedClient {
  socket: Socket;
  userId: string;
  connectedAt: Date;
  userAgent: string;
  ip: string;
}

@WebSocketGateway({
  namespace: '/notifications',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
})
@Injectable()
export class NotificationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationGateway.name);
  private connectedClients = new Map<string, ConnectedClient>();

  constructor(private jwtService: JwtService) {
    this.logger.log('NotificationGateway initialized with WebSocket support');
  }

  async handleConnection(client: Socket) {
    try {
      // Extract token from auth or query
      const token = client.handshake.auth?.token || client.handshake.query?.token;
      
      if (!token) {
        this.logger.warn(`❌ Client ${client.id} connected without authentication token`);
        client.emit('error', { message: 'Authentication required', code: 'NO_TOKEN' });
        client.disconnect();
        return;
      }

      // Verify JWT token with timeout
      let payload;
      try {
        payload = this.jwtService.verify(token);
      } catch (jwtError) {
        this.logger.warn(`❌ Client ${client.id} connected with invalid/expired token: ${jwtError.message}`);
        client.emit('error', { message: 'Authentication failed', code: 'INVALID_TOKEN' });
        client.disconnect();
        return;
      }
      
      const userId = payload.sub;
      if (!userId) {
        this.logger.warn(`❌ Client ${client.id} connected with token missing user ID`);
        client.emit('error', { message: 'Invalid token payload', code: 'NO_USER_ID' });
        client.disconnect();
        return;
      }

      // Check if user already has connections and limit concurrent connections
      const existingConnections = Array.from(this.connectedClients.values())
        .filter(conn => conn.userId === userId);
      
      if (existingConnections.length >= 5) { // Limit to 5 concurrent connections per user
        this.logger.warn(`❌ User ${userId} exceeded maximum concurrent connections (${existingConnections.length})`);
        client.emit('error', { 
          message: 'Too many concurrent connections', 
          code: 'TOO_MANY_CONNECTIONS',
          maxConnections: 5 
        });
        client.disconnect();
        return;
      }
      
      // Store client connection with additional metadata
      this.connectedClients.set(client.id, { 
        socket: client, 
        userId,
        connectedAt: new Date(),
        userAgent: client.handshake.headers['user-agent'] || 'unknown',
        ip: client.handshake.address || 'unknown'
      });
      
      // Join user-specific room with error handling
      try {
        await client.join(`user_${userId}`);
        this.logger.log(`✅ Notification client ${client.id} connected for user ${userId} (${existingConnections.length + 1} total connections)`);
      } catch (roomError) {
        this.logger.error(`❌ Failed to join room for user ${userId}:`, roomError.message);
        this.connectedClients.delete(client.id);
        client.emit('error', { message: 'Failed to join notification room', code: 'ROOM_JOIN_FAILED' });
        client.disconnect();
        return;
      }
      
      // Send connection confirmation with connection stats
      client.emit('connected', { 
        message: 'Connected to notifications',
        userId,
        connectionId: client.id,
        totalConnections: existingConnections.length + 1,
        timestamp: new Date().toISOString()
      });
      
      // Set up ping/pong to keep connection alive
      const pingInterval = setInterval(() => {
        if (client.connected) {
          client.emit('ping', { timestamp: new Date().toISOString() });
        } else {
          clearInterval(pingInterval);
        }
      }, 30000); // Ping every 30 seconds

      // Store ping interval for cleanup
      (client as any).pingInterval = pingInterval;
      
    } catch (error) {
      this.logger.error(`❌ Notification connection handling failed for client ${client.id}:`, error);
      client.emit('error', { message: 'Connection failed', code: 'CONNECTION_ERROR' });
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const connection = this.connectedClients.get(client.id);
    
    // Clean up ping interval if it exists
    if ((client as any).pingInterval) {
      clearInterval((client as any).pingInterval);
    }
    
    if (connection) {
      const connectionDuration = Date.now() - connection.connectedAt.getTime();
      const durationMinutes = Math.round(connectionDuration / (1000 * 60));
      
      this.logger.log(`❌ Client ${client.id} (user ${connection.userId}) disconnected after ${durationMinutes} minutes`);
      this.connectedClients.delete(client.id);
      
      // Log remaining connections for this user
      const remainingConnections = Array.from(this.connectedClients.values())
        .filter(conn => conn.userId === connection.userId);
      
      if (remainingConnections.length > 0) {
        this.logger.debug(`User ${connection.userId} has ${remainingConnections.length} remaining connections`);
      }
    } else {
      this.logger.debug(`Client ${client.id} disconnected (no stored connection info)`);
    }
  }

  @SubscribeMessage('pong')
  handlePong(@ConnectedSocket() client: Socket) {
    // Client responded to ping, connection is alive
    this.logger.debug(`Client ${client.id} responded to ping`);
  }

  @SubscribeMessage('join-room')
  async handleJoinRoom(@MessageBody() data: { room: string }, @ConnectedSocket() client: Socket) {
    try {
      await client.join(data.room);
      this.logger.debug(`Client ${client.id} joined room: ${data.room}`);
      client.emit('joined-room', { room: data.room, success: true });
    } catch (error) {
      this.logger.error(`Failed to join room ${data.room} for client ${client.id}:`, error);
      client.emit('joined-room', { room: data.room, success: false, error: 'Failed to join room' });
    }
  }

  @SubscribeMessage('leave-room')
  async handleLeaveRoom(@MessageBody() data: { room: string }, @ConnectedSocket() client: Socket) {
    try {
      await client.leave(data.room);
      this.logger.debug(`Client ${client.id} left room: ${data.room}`);
      client.emit('left-room', { room: data.room, success: true });
    } catch (error) {
      this.logger.error(`Failed to leave room ${data.room} for client ${client.id}:`, error);
      client.emit('left-room', { room: data.room, success: false, error: 'Failed to leave room' });
    }
  }

  // Send notification to specific user
  async sendToUser(userId: string, notification: NotificationPayload): Promise<boolean> {
    try {
      const room = `user_${userId}`;
      
      // Get all sockets in the user's room
      const socketsInRoom = await this.server.in(room).fetchSockets();
      
      if (socketsInRoom.length === 0) {
        this.logger.debug(`No active WebSocket connections for user ${userId}`);
        return false;
      }

      // Filter out any disconnected sockets from our tracking
      const activeConnections = socketsInRoom.filter(socket => {
        const connection = this.connectedClients.get(socket.id);
        if (!connection) {
          return false;
        }
        return true;
      });

      if (activeConnections.length === 0) {
        this.logger.debug(`No active connections found for user ${userId} after cleanup`);
        return false;
      }

      // Send notification to the room
      this.server.to(room).emit('notification', {
        ...notification,
        id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, // Add unique ID
        deliveredAt: new Date().toISOString()
      });
      
      this.logger.debug(`Notification sent to user ${userId}: ${notification.type} (${activeConnections.length} connections)`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send notification to user ${userId}:`, error.message);
      return false;
    }
  }

  // Send notification to all users in a department
  async sendToDepartment(departmentId: string, notification: NotificationPayload) {
    try {
      this.server.to(`department_${departmentId}`).emit('notification', notification);
      this.logger.debug(`Notification sent to department ${departmentId}: ${notification.type}`);
    } catch (error) {
      this.logger.error(`Failed to send notification to department ${departmentId}`, error);
    }
  }

  // Broadcast notification to all connected clients
  async sendToAll(notification: NotificationPayload) {
    try {
      this.server.emit('notification', notification);
      this.logger.debug(`Broadcast notification: ${notification.type}`);
    } catch (error) {
      this.logger.error('Failed to broadcast notification', error);
    }
  }

  // Send notification about gate pass creation to approvers
  async notifyGatePassCreated(gatePassId: string, approverIds: string[], gatePassData: any) {
    const notification: NotificationPayload = {
      type: 'GATE_PASS_PENDING_APPROVAL',
      title: 'Yêu cầu duyệt giấy ra vào cổng',
      message: `${gatePassData.user.firstName} ${gatePassData.user.lastName} đã tạo yêu cầu giấy ra vào cổng`,
      data: {
        gatePassId,
        passNumber: gatePassData.passNumber,
        requester: gatePassData.user,
        reason: gatePassData.reasonType,
        location: gatePassData.location,
        startDateTime: gatePassData.startDateTime,
        endDateTime: gatePassData.endDateTime,
      },
      timestamp: new Date(),
    };

    // Send to each approver
    for (const approverId of approverIds) {
      await this.sendToUser(approverId, notification);
    }
  }

  // Send notification about gate pass approval to requester
  async notifyGatePassApproved(userId: string, gatePassData: any) {
    const notification: NotificationPayload = {
      type: 'GATE_PASS_APPROVED',
      title: 'Giấy ra vào cổng đã được duyệt',
      message: `Giấy ra vào cổng ${gatePassData.passNumber} của bạn đã được duyệt`,
      data: {
        gatePassId: gatePassData.id,
        passNumber: gatePassData.passNumber,
        status: gatePassData.status,
      },
      timestamp: new Date(),
    };

    await this.sendToUser(userId, notification);
  }

  // Send notification about gate pass rejection to requester
  async notifyGatePassRejected(userId: string, gatePassData: any, reason?: string) {
    const notification: NotificationPayload = {
      type: 'GATE_PASS_REJECTED',
      title: 'Giấy ra vào cổng bị từ chối',
      message: `Giấy ra vào cổng ${gatePassData.passNumber} của bạn đã bị từ chối`,
      data: {
        gatePassId: gatePassData.id,
        passNumber: gatePassData.passNumber,
        reason,
        status: gatePassData.status,
      },
      timestamp: new Date(),
    };

    await this.sendToUser(userId, notification);
  }

  // Send notification about gate pass deletion to approvers
  async notifyGatePassDeleted(gatePassId: string, approverIds: string[], gatePassData: any) {
    const notification: NotificationPayload = {
      type: 'GATE_PASS_DELETED',
      title: 'Giấy ra vào cổng đã bị xóa',
      message: `Giấy ra vào cổng ${gatePassData.passNumber} đã bị xóa bởi người tạo`,
      data: {
        gatePassId,
        passNumber: gatePassData.passNumber,
        status: 'DELETED',
      },
      timestamp: new Date(),
    };

    // Send to each approver
    for (const approverId of approverIds) {
      await this.sendToUser(approverId, notification);
    }
  }

  async notifyGatePassUpdated(gatePassId: string, approverIds: string[], gatePassData: any) {
    const notification: NotificationPayload = {
      type: 'GATE_PASS_UPDATED',
      title: 'Giấy ra vào cổng đã được cập nhật',
      message: `${gatePassData.user.name} đã cập nhật thông tin giấy ra vào cổng ${gatePassData.passNumber}`,
      data: {
        gatePassId,
        passNumber: gatePassData.passNumber,
        reasonType: gatePassData.reasonType,
        startDateTime: gatePassData.startDateTime,
        endDateTime: gatePassData.endDateTime,
        status: gatePassData.status,
        user: gatePassData.user,
      },
      timestamp: new Date(),
    };

    // Send to each approver
    for (const approverId of approverIds) {
      await this.sendToUser(approverId, notification);
    }
  }

  async notifyGatePassCancellationRequested(gatePassId: string, approverIds: string[], gatePassData: any) {
    const notification: NotificationPayload = {
      type: 'GATE_PASS_CANCELLATION_REQUESTED',
      title: 'Yêu cầu hủy giấy ra vào cổng',
      message: `${gatePassData.requester.name} yêu cầu hủy giấy ra vào cổng ${gatePassData.passNumber}`,
      data: {
        gatePassId,
        passNumber: gatePassData.passNumber,
        requester: gatePassData.requester,
        reason: gatePassData.reason,
        startDateTime: gatePassData.startDateTime,
        endDateTime: gatePassData.endDateTime,
        status: 'CANCELLATION_REQUESTED',
      },
      timestamp: new Date(),
    };

    // Send to each approver
    for (const approverId of approverIds) {
      await this.sendToUser(approverId, notification);
    }
  }

  async notifyGatePassCancellationApproved(gatePassId: string, requesterIds: string[], gatePassData: any) {
    const notification: NotificationPayload = {
      type: 'GATE_PASS_CANCELLATION_APPROVED',
      title: 'Yêu cầu hủy giấy ra vào cổng đã được duyệt',
      message: `Yêu cầu hủy giấy ra vào cổng ${gatePassData.passNumber} của bạn đã được ${gatePassData.approver.name} phê duyệt`,
      data: {
        gatePassId,
        passNumber: gatePassData.passNumber,
        approver: gatePassData.approver,
        comment: gatePassData.comment,
        startDateTime: gatePassData.startDateTime,
        endDateTime: gatePassData.endDateTime,
        status: 'CANCELLED',
      },
      timestamp: new Date(),
    };

    // Send to each requester (typically just one)
    for (const requesterId of requesterIds) {
      await this.sendToUser(requesterId, notification);
    }
  }

  async notifyGatePassCancellationRejected(gatePassId: string, requesterIds: string[], gatePassData: any) {
    const notification: NotificationPayload = {
      type: 'GATE_PASS_CANCELLATION_REJECTED',
      title: 'Yêu cầu hủy giấy ra vào cổng bị từ chối',
      message: `Yêu cầu hủy giấy ra vào cổng ${gatePassData.passNumber} của bạn đã bị ${gatePassData.approver.name} từ chối`,
      data: {
        gatePassId,
        passNumber: gatePassData.passNumber,
        approver: gatePassData.approver,
        comment: gatePassData.comment,
        startDateTime: gatePassData.startDateTime,
        endDateTime: gatePassData.endDateTime,
        status: 'APPROVED', // Status remains as approved since cancellation was rejected
      },
      timestamp: new Date(),
    };

    // Send to each requester (typically just one)
    for (const requesterId of requesterIds) {
      await this.sendToUser(requesterId, notification);
    }
  }

  /**
   * Get connection statistics for monitoring
   */
  getConnectionStats(): {
    totalConnections: number;
    uniqueUsers: number;
    connectionsByUser: Record<string, number>;
    oldestConnection?: Date;
    newestConnection?: Date;
  } {
    const connections = Array.from(this.connectedClients.values());
    const connectionsByUser: Record<string, number> = {};
    
    connections.forEach(conn => {
      connectionsByUser[conn.userId] = (connectionsByUser[conn.userId] || 0) + 1;
    });

    const connectionTimes = connections.map(conn => conn.connectedAt);
    
    return {
      totalConnections: connections.length,
      uniqueUsers: Object.keys(connectionsByUser).length,
      connectionsByUser,
      oldestConnection: connectionTimes.length > 0 ? new Date(Math.min(...connectionTimes.map(d => d.getTime()))) : undefined,
      newestConnection: connectionTimes.length > 0 ? new Date(Math.max(...connectionTimes.map(d => d.getTime()))) : undefined,
    };
  }

  /**
   * Health check for WebSocket gateway
   */
  getHealthStatus(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: string;
    connections: number;
    users: number;
  } {
    const stats = this.getConnectionStats();
    
    if (stats.totalConnections === 0) {
      return {
        status: 'healthy', // No connections is normal
        details: 'No active connections',
        connections: 0,
        users: 0,
      };
    }

    if (stats.totalConnections > 1000) {
      return {
        status: 'degraded',
        details: 'High connection count may impact performance',
        connections: stats.totalConnections,
        users: stats.uniqueUsers,
      };
    }

    return {
      status: 'healthy',
      details: 'WebSocket gateway operating normally',
      connections: stats.totalConnections,
      users: stats.uniqueUsers,
    };
  }

  /**
   * Cleanup stale connections
   */
  async cleanupStaleConnections(): Promise<number> {
    let removedCount = 0;
    const staleThreshold = 30 * 60 * 1000; // 30 minutes
    const now = Date.now();
    
    for (const [clientId, connection] of this.connectedClients) {
      const connectionAge = now - connection.connectedAt.getTime();
      
      if (!connection.socket.connected || connectionAge > staleThreshold) {
        this.logger.debug(`Removing stale connection ${clientId} for user ${connection.userId}`);
        this.connectedClients.delete(clientId);
        
        if (connection.socket.connected) {
          try {
            connection.socket.disconnect();
          } catch (error) {
            this.logger.debug(`Error disconnecting stale socket ${clientId}:`, error.message);
          }
        }
        
        removedCount++;
      }
    }
    
    if (removedCount > 0) {
      this.logger.log(`Cleaned up ${removedCount} stale WebSocket connections`);
    }
    
    return removedCount;
  }
}