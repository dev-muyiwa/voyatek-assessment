import { Server, Socket } from 'socket.io';
import { Database } from '../../config/db';
import { Logger } from '../../config/logger';
import jwt from 'jsonwebtoken';
import { RedisClient } from '../../config/redis';
import { PresenceService } from '../users/presence.service';
import { RateLimiterService } from '../users/rate-limiter.service';
import { ValidationService } from '../common/validation.service';
import { MessageReceiptsService } from '../messages/message-receipts.service';
import { inject, injectable } from 'inversify';
import { LIB_TYPES, SERVICE_TYPES } from '../../di/types';

type InvitePayload = { u: string; r: string; t: number };

export function createInviteToken(secret: string, userId: string, roomId: string): string {
  const token = jwt.sign({ u: userId, r: roomId }, secret, { expiresIn: '3d' });
  return Buffer.from(token).toString('base64');
}

export function verifyInviteToken(secret: string, base64Token: string): InvitePayload | null {
  try {
    const decoded = Buffer.from(base64Token, 'base64').toString('utf8');
    const payload = jwt.verify(decoded, secret) as any;
    return { u: payload.u, r: payload.r, t: Date.now() };
  } catch {
    return null;
  }
}

@injectable()
export class SocketService {
  private io!: Server;
  private client: any;

  constructor(
    @inject(LIB_TYPES.KnexDB) private readonly db: Database,
    @inject(LIB_TYPES.Logger) private readonly logger: Logger,
    @inject(LIB_TYPES.RedisClient) private readonly redisClient: RedisClient,
    @inject(SERVICE_TYPES.PresenceService) private readonly presenceService: PresenceService,
    @inject(SERVICE_TYPES.RateLimiterService) private readonly rateLimiterService: RateLimiterService,
    @inject(SERVICE_TYPES.ValidationService) private readonly validationService: ValidationService,
    @inject(SERVICE_TYPES.MessageReceiptsService) private readonly messageReceiptsService: MessageReceiptsService,
  ) {
    this.client = this.db.connection;
  }

  /**
   * Initialize socket server with authentication and event handlers
   */
  public init(io: Server, secret: string): void {
    this.io = io;
    this.setupAuthenticationMiddleware(secret);
    this.setupConnectionHandler(secret);
  }

  /**
   * Socket authentication middleware
   */
  private async authenticateSocket(socket: Socket, secret: string): Promise<{ id: string; email: string } | null> {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        this.logger.debug('No token provided for socket connection');
        return null;
      }

      const payload = jwt.verify(token, secret, { ignoreExpiration: true }) as any;
      const tokenKey = `users:${payload.sub}:session-${payload.lastLogin}`;
      const ttl = await this.redisClient.client.ttl(tokenKey);
      
      if (ttl < 0) {
        this.logger.debug('Token expired for socket connection', { userId: payload.sub });
        return null;
      }

      // Extend token TTL
      const expiration = payload.rememberMe ? 30 * 24 * 60 * 60 : 5 * 24 * 60 * 60;
      await this.redisClient.client.expire(tokenKey, expiration);

      return {
        id: payload.sub as string,
        email: payload.email,
      };
    } catch (err: any) {
      this.logger.debug('Invalid token for socket connection', { error: err.message });
      return null;
    }
  }

  /**
   * Verify user is a member of the room
   */
  private async verifyRoomMembership(userId: string, roomId: string): Promise<boolean> {
    const membership = await this.client.room_members.findFirst({
            where: {
        room_id: roomId,
              member_id: userId,
        deleted_at: null,
      },
      select: { id: true },
    });
    return !!membership;
  }

  /**
   * Setup authentication middleware for socket connections
   */
  private setupAuthenticationMiddleware(secret: string): void {
    this.io.use(async (socket, next) => {
      const user = await this.authenticateSocket(socket, secret);
      if (!user) {
        this.logger.debug('Socket connection rejected: unauthenticated', { socketId: socket.id });
        return next(new Error('Unauthorized'));
      }
      
      socket.data.user = user;
      this.logger.debug('Socket authenticated', { userId: user.id, socketId: socket.id });
      next();
    });
  }

  /**
   * Setup main connection handler and event listeners
   */
  private setupConnectionHandler(secret: string): void {
    this.io.on('connection', async (socket: Socket) => {
      const user = socket.data.user;
      this.logger.info(`authenticated socket connected: ${socket.id}`, { userId: user.id });

      // Set user as online
      await this.presenceService.setUserOnline(user.id, socket.id);
      
      // Start heartbeat for presence
      const heartbeat = this.presenceService.startHeartbeat(user.id);
      socket.data.heartbeat = heartbeat;

      // Setup event handlers
      this.setupJoinRoomHandler(socket, user);
      this.setupSendMessageHandler(socket, user);
      this.setupTypingHandler(socket, user);
      this.setupMessageReceiptHandlers(socket, user);
      this.setupLeaveRoomHandler(socket, user);
      this.setupDisconnectHandler(socket, user);
    });
  }

  /**
   * Setup join room event handler
   */
  private setupJoinRoomHandler(socket: Socket, user: { id: string; email: string }): void {
    socket.on('join_room', async (data: { roomId: string }) => {
      try {
        // Rate limiting for join room requests
        const rateLimitResult = await this.rateLimiterService.checkRateLimit(
          user.id,
          RateLimiterService.CONFIGS.JOIN_ROOM_RATE_LIMIT
        );

        if (!rateLimitResult.allowed) {
          socket.emit('join_room_error', { 
            message: 'Too many join attempts. Please try again later.',
            retryAfter: rateLimitResult.retryAfter
          });
          return;
        }

        // Validate join room data
        const validationResult = this.validationService.validateJoinRoomData(data);
        if (!validationResult.isValid) {
          socket.emit('join_room_error', { 
            message: 'Invalid request data',
            errors: validationResult.errors
          });
          return;
        }

        const { roomId } = data;

        // Check if room exists and get room info
        const room = await this.client.rooms.findFirst({
          where: { id: roomId, deleted_at: null },
          select: { id: true, is_private: true, name: true }
        });

        if (!room) {
          socket.emit('join_room_error', { message: 'Room not found' });
          return;
        }

        // Verify user is a member of the room
        const isMember = await this.verifyRoomMembership(user.id, roomId);
        if (!isMember) {
          this.logger.debug('User attempted to join room without membership', { 
            userId: user.id, 
            roomId,
            roomName: room.name,
            isPrivate: room.is_private
          });
          
          const errorMessage = room.is_private 
            ? 'This is a private room. You need an invitation to join.'
            : 'You are not a member of this room';
            
          socket.emit('join_room_error', { message: errorMessage });
          return;
        }

        // Join the room
        socket.join(roomId);
        socket.data.currentRoomId = roomId;
        
        // Add user to room presence tracking
        await this.presenceService.addUserToRoom(roomId, user.id);
        
        // Get user's current presence
        const userPresence = await this.presenceService.getUserPresence(user.id);
        
        // Notify other users in the room about user joining
        socket.to(roomId).emit('user_joined', { 
          userId: user.id, 
          status: userPresence?.status || 'online',
          timestamp: new Date().toISOString()
        });

        // Broadcast user status to room
        socket.to(roomId).emit('user_status', {
          userId: user.id,
          status: 'online',
          lastSeen: userPresence?.lastSeen || new Date().toISOString(),
          timestamp: new Date().toISOString()
        });

        // Get current room presence for the joining user
        const roomPresence = await this.presenceService.getRoomPresence(roomId);

        // Auto-mark unread messages as read when user joins room
        const unreadMessages = await this.messageReceiptsService.getUnreadMessages(user.id, roomId);
        if (unreadMessages.length > 0) {
          const readCount = await this.messageReceiptsService.markMultipleAsRead(unreadMessages, user.id);
          if (readCount > 0) {
            // Notify about auto-read
            this.io.to(roomId).emit('messages_read', {
              recipientId: user.id,
              messageCount: readCount,
              timestamp: new Date().toISOString()
            });
          }
        }
        
        // Confirm successful join to the user with current room presence
        socket.emit('joined_room', { 
          roomId,
          timestamp: new Date().toISOString(),
          presence: roomPresence,
          unreadCount: unreadMessages.length
        });

        this.logger.debug('User joined room', { userId: user.id, roomId });
      } catch (e: any) {
        this.logger.error('join_room error', { error: e.message, userId: user.id });
        socket.emit('join_room_error', { message: 'Failed to join room' });
      }
    });
  }

  /**
   * Setup send message event handler
   */
  private setupSendMessageHandler(socket: Socket, user: { id: string; email: string }): void {
    socket.on('send_message', async (data: { roomId: string; content: string }) => {
      try {
                // Rate limiting for message sending
        const rateLimitResult = await this.rateLimiterService.checkRateLimit(
          user.id,
          RateLimiterService.CONFIGS.MESSAGE_RATE_LIMIT
        );

        if (!rateLimitResult.allowed) {
          socket.emit('message_error', { 
            message: `Rate limit exceeded. You can send ${RateLimiterService.CONFIGS.MESSAGE_RATE_LIMIT.maxRequests} messages per ${RateLimiterService.CONFIGS.MESSAGE_RATE_LIMIT.windowSeconds} seconds.`,
            retryAfter: rateLimitResult.retryAfter,
            remaining: rateLimitResult.remaining
          });
          return;
        }

        const { roomId, content } = data || {};

        // Validate room ID
        if (!roomId) {
          socket.emit('message_error', { message: 'Room ID is required' });
          return;
        }

        const roomValidation = this.validationService.validateRoomId(roomId);
        if (!roomValidation.isValid) {
          socket.emit('message_error', { 
            message: 'Invalid room ID format',
            errors: roomValidation.errors
          });
          return;
        }

        // Validate message content
        const messageValidation = this.validationService.validateMessage(content);
        if (!messageValidation.isValid) {
          socket.emit('message_error', { 
            message: 'Invalid message content',
            errors: messageValidation.errors
          });
          return;
        }

        // Sanitize the message content
        const sanitizedContent = this.validationService.sanitizeMessage(content);
        if (!sanitizedContent) {
          socket.emit('message_error', { message: 'Message content cannot be empty after sanitization' });
          return;
        }

        // Check if user is currently in the room (socket level)
        if (socket.data.currentRoomId !== roomId) {
          socket.emit('message_error', { message: 'You must join the room before sending messages' });
          return;
        }

        // Verify user is a member of the room (database level)
        const isMember = await this.verifyRoomMembership(user.id, roomId);
        if (!isMember) {
          this.logger.debug('User attempted to send message to room without membership', { 
            userId: user.id, 
            roomId 
          });
          socket.emit('message_error', { message: 'You are not a member of this room' });
          return;
        }

        // Create the message in the database
        const message = await this.client.messages.create({
          data: { 
            room_id: roomId, 
            sender_id: user.id, 
            content: sanitizedContent 
          },
            select: {
              id: true,
              room_id: true,
              content: true,
              created_at: true,
              sender: {
                select: {
                id: true,
                  username: true,
                first_name: true,
                last_name: true,
                },
              },
            },
          });

        // Create delivery receipts for all room members (except sender)
        await this.messageReceiptsService.createDeliveryReceipts(message.id, roomId, user.id);

        // Broadcast message to all room members
        this.io.to(roomId).emit('receive_message', {
          ...message,
          timestamp: message.created_at.toISOString(),
        });

        this.logger.debug('Message sent with receipts', { 
          messageId: message.id, 
          userId: user.id, 
          roomId,
          contentLength: sanitizedContent.length
        });
      } catch (e: any) {
        this.logger.error('send_message error', { error: e.message, userId: user.id });
        socket.emit('message_error', { message: 'Failed to send message' });
      }
    });
  }

  /**
   * Setup typing event handler
   */
  private setupTypingHandler(socket: Socket, user: { id: string; email: string }): void {
    socket.on('typing', async (data: { roomId: string; isTyping: boolean }) => {
      try {
        // Rate limiting for typing indicators
        const rateLimitResult = await this.rateLimiterService.checkRateLimit(
          user.id,
          RateLimiterService.CONFIGS.TYPING_RATE_LIMIT
        );

        if (!rateLimitResult.allowed) {
          // Silently ignore excessive typing requests
          return;
        }

        // Validate typing data
        const validationResult = this.validationService.validateTypingData(data);
        if (!validationResult.isValid) {
          this.logger.debug('Invalid typing data', { 
            userId: user.id, 
            data, 
            errors: validationResult.errors 
          });
          return;
        }

        const { roomId, isTyping } = data;

        // Check if user is currently in the room
        if (socket.data.currentRoomId !== roomId) {
          return;
        }

        // Broadcast typing indicator to other room members
        socket.to(roomId).emit('typing', { 
          userId: user.id, 
          isTyping: !!isTyping,
          timestamp: new Date().toISOString()
        });
      } catch (e: any) {
        this.logger.error('typing error', { error: e.message, userId: user.id });
      }
    });
  }

  /**
   * Setup message receipt event handlers
   */
  private setupMessageReceiptHandlers(socket: Socket, user: { id: string; email: string }): void {

    // Mark message as read
    socket.on('message_read', async (data: { messageId: string; roomId: string }) => {
      try {
        const { messageId, roomId } = data || {};

        if (!messageId || !roomId) {
          return;
        }

        // Verify user is in the room
        if (socket.data.currentRoomId !== roomId) {
          return;
        }

        // Mark as read
        const updated = await this.messageReceiptsService.markAsRead(messageId, user.id);
        
        if (updated) {
          // Notify the sender that the message was read
          this.io.to(roomId).emit('message_receipt', {
            messageId,
            recipientId: user.id,
            status: 'read',
            timestamp: new Date().toISOString()
          });
        }
      } catch (e: any) {
        this.logger.error('message_read error', { error: e.message, userId: user.id });
      }
    });

    // (removed) delivered receipts are handled by DB defaults; we only track read status now

    // Bulk mark messages as read
    socket.on('mark_messages_read', async (data: { messageIds: string[]; roomId: string }) => {
      try {
        const { messageIds, roomId } = data || {};

        if (!messageIds || !Array.isArray(messageIds) || !roomId) {
          return;
        }

        // Verify user is in the room
        if (socket.data.currentRoomId !== roomId) {
          return;
        }

        // Bulk mark as read
        const updatedCount = await this.messageReceiptsService.markMultipleAsRead(messageIds, user.id);
        
        if (updatedCount > 0) {
          // Notify about bulk read
          this.io.to(roomId).emit('messages_read', {
            recipientId: user.id,
            messageCount: updatedCount,
            timestamp: new Date().toISOString()
          });
        }
      } catch (e: any) {
        this.logger.error('mark_messages_read error', { error: e.message, userId: user.id });
      }
    });
  }

  /**
   * Setup leave room event handler
   */
  private setupLeaveRoomHandler(socket: Socket, user: { id: string; email: string }): void {
    socket.on('leave_room', async (data: { roomId: string }) => {
      try {
        const { roomId } = data || {};
        
        if (!roomId) {
          return;
        }

        socket.leave(roomId);
        if (socket.data.currentRoomId === roomId) {
          socket.data.currentRoomId = null;
        }

        // Remove user from room presence tracking
        await this.presenceService.removeUserFromRoom(roomId, user.id);

        // Notify other users in the room
        socket.to(roomId).emit('user_left', { 
          userId: user.id, 
          timestamp: new Date().toISOString()
        });

        // Broadcast user status change to room
        socket.to(roomId).emit('user_status', {
          userId: user.id,
          status: 'offline',
          lastSeen: new Date().toISOString(),
          timestamp: new Date().toISOString()
        });

        socket.emit('left_room', { 
          roomId,
          timestamp: new Date().toISOString()
        });

        this.logger.debug('User left room', { userId: user.id, roomId });
      } catch (e: any) {
        this.logger.error('leave_room error', { error: e.message, userId: user.id });
      }
    });
  }

  /**
   * Setup disconnect event handler
   */
  private setupDisconnectHandler(socket: Socket, user: { id: string; email: string }): void {
    socket.on('disconnect', async () => {
      const currentRoomId = socket.data.currentRoomId;
      
      // Clear heartbeat
      if (socket.data.heartbeat) {
        clearInterval(socket.data.heartbeat);
      }
      
      // Handle user disconnect in presence service
      await this.presenceService.handleUserDisconnect(user.id, currentRoomId);
      
      if (currentRoomId) {
        // Notify other users in the room
        socket.to(currentRoomId).emit('user_left', { 
          userId: user.id, 
          timestamp: new Date().toISOString()
        });

        // Broadcast user status change to room
        socket.to(currentRoomId).emit('user_status', {
          userId: user.id,
          status: 'offline',
          lastSeen: new Date().toISOString(),
          timestamp: new Date().toISOString()
        });
      }
      
      this.logger.info(`authenticated socket disconnected: ${socket.id}`, { userId: user.id });
    });
  }
}

