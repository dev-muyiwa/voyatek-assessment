import { inject, injectable } from 'inversify';
import { LIB_TYPES } from '../../di/types';
import { Logger } from '../../config/logger';
import { RedisClient } from '../../config/redis';
import Redis from 'ioredis';

export interface UserPresence {
  userId: string;
  status: 'online' | 'offline';
  lastSeen: string;
  socketId?: string;
}

@injectable()
export class PresenceService {
  private _redisClient: Redis;
  private readonly PRESENCE_KEY_PREFIX = 'presence:user:';
  private readonly ROOM_PRESENCE_KEY_PREFIX = 'room:presence:';
  private readonly PRESENCE_TTL = 30; // 30 seconds TTL for online status

  constructor(
    @inject(LIB_TYPES.Logger) private readonly _logger: Logger,
    @inject(LIB_TYPES.RedisClient) private readonly _redis: RedisClient,
  ) {
    this._redisClient = this._redis.client;
  }

  /**
   * Set user as online
   */
  async setUserOnline(userId: string, socketId: string): Promise<void> {
    try {
      const presenceData: UserPresence = {
        userId,
        status: 'online',
        lastSeen: new Date().toISOString(),
        socketId,
      };

      const key = `${this.PRESENCE_KEY_PREFIX}${userId}`;
      await this._redisClient.setex(key, this.PRESENCE_TTL, JSON.stringify(presenceData));
      
      this._logger.debug('User set as online', { userId, socketId });
    } catch (error: any) {
      this._logger.error('Failed to set user online', { error: error.message, userId });
    }
  }

  /**
   * Set user as offline
   */
  async setUserOffline(userId: string): Promise<void> {
    try {
      const presenceData: UserPresence = {
        userId,
        status: 'offline',
        lastSeen: new Date().toISOString(),
      };

      const key = `${this.PRESENCE_KEY_PREFIX}${userId}`;
      // Store offline status with longer TTL for last seen tracking
      await this._redisClient.setex(key, 24 * 60 * 60, JSON.stringify(presenceData)); // 24 hours
      
      this._logger.debug('User set as offline', { userId });
    } catch (error: any) {
      this._logger.error('Failed to set user offline', { error: error.message, userId });
    }
  }

  /**
   * Update user's last seen timestamp
   */
  async updateLastSeen(userId: string): Promise<void> {
    try {
      const key = `${this.PRESENCE_KEY_PREFIX}${userId}`;
      const existingData = await this._redisClient.get(key);
      
      if (existingData) {
        const presence: UserPresence = JSON.parse(existingData);
        presence.lastSeen = new Date().toISOString();
        
        // Refresh TTL for online users
        const ttl = presence.status === 'online' ? this.PRESENCE_TTL : 24 * 60 * 60;
        await this._redisClient.setex(key, ttl, JSON.stringify(presence));
      }
    } catch (error: any) {
      this._logger.error('Failed to update last seen', { error: error.message, userId });
    }
  }

  /**
   * Get user presence status
   */
  async getUserPresence(userId: string): Promise<UserPresence | null> {
    try {
      const key = `${this.PRESENCE_KEY_PREFIX}${userId}`;
      const data = await this._redisClient.get(key);
      
      if (!data) {
        return {
          userId,
          status: 'offline',
          lastSeen: new Date().toISOString(),
        };
      }

      const presence: UserPresence = JSON.parse(data);
      
      // Check if online status has expired
      if (presence.status === 'online') {
        const ttl = await this._redisClient.ttl(key);
        if (ttl <= 0) {
          // Status expired, mark as offline
          await this.setUserOffline(userId);
          return {
            userId,
            status: 'offline',
            lastSeen: presence.lastSeen,
          };
        }
      }

      return presence;
    } catch (error: any) {
      this._logger.error('Failed to get user presence', { error: error.message, userId });
      return {
        userId,
        status: 'offline',
        lastSeen: new Date().toISOString(),
      };
    }
  }

  /**
   * Get presence for multiple users
   */
  async getMultipleUserPresence(userIds: string[]): Promise<UserPresence[]> {
    try {
      const keys = userIds.map(userId => `${this.PRESENCE_KEY_PREFIX}${userId}`);
      const results = await this._redisClient.mget(...keys);
      
      return userIds.map((userId, index) => {
        const data = results[index];
        if (!data) {
          return {
            userId,
            status: 'offline' as const,
            lastSeen: new Date().toISOString(),
          };
        }

        try {
          return JSON.parse(data);
        } catch {
          return {
            userId,
            status: 'offline' as const,
            lastSeen: new Date().toISOString(),
          };
        }
      });
    } catch (error: any) {
      this._logger.error('Failed to get multiple user presence', { error: error.message, userIds });
      return userIds.map(userId => ({
        userId,
        status: 'offline' as const,
        lastSeen: new Date().toISOString(),
      }));
    }
  }

  /**
   * Add user to room presence tracking
   */
  async addUserToRoom(roomId: string, userId: string): Promise<void> {
    try {
      const key = `${this.ROOM_PRESENCE_KEY_PREFIX}${roomId}`;
      await this._redisClient.sadd(key, userId);
      await this._redisClient.expire(key, 24 * 60 * 60); // 24 hours
      
      this._logger.debug('User added to room presence', { roomId, userId });
    } catch (error: any) {
      this._logger.error('Failed to add user to room presence', { error: error.message, roomId, userId });
    }
  }

  /**
   * Remove user from room presence tracking
   */
  async removeUserFromRoom(roomId: string, userId: string): Promise<void> {
    try {
      const key = `${this.ROOM_PRESENCE_KEY_PREFIX}${roomId}`;
      await this._redisClient.srem(key, userId);
      
      this._logger.debug('User removed from room presence', { roomId, userId });
    } catch (error: any) {
      this._logger.error('Failed to remove user from room presence', { error: error.message, roomId, userId });
    }
  }

  /**
   * Get all users currently in a room
   */
  async getRoomUsers(roomId: string): Promise<string[]> {
    try {
      const key = `${this.ROOM_PRESENCE_KEY_PREFIX}${roomId}`;
      return await this._redisClient.smembers(key);
    } catch (error: any) {
      this._logger.error('Failed to get room users', { error: error.message, roomId });
      return [];
    }
  }

  /**
   * Get room presence with user details
   */
  async getRoomPresence(roomId: string): Promise<UserPresence[]> {
    try {
      const userIds = await this.getRoomUsers(roomId);
      return await this.getMultipleUserPresence(userIds);
    } catch (error: any) {
      this._logger.error('Failed to get room presence', { error: error.message, roomId });
      return [];
    }
  }

  /**
   * Start heartbeat for keeping user online
   */
  startHeartbeat(userId: string): NodeJS.Timeout {
    return setInterval(async () => {
      await this.updateLastSeen(userId);
    }, 15000); // Update every 15 seconds
  }

  /**
   * Clean up user presence on disconnect
   */
  async handleUserDisconnect(userId: string, roomId?: string): Promise<void> {
    try {
      await this.setUserOffline(userId);
      
      if (roomId) {
        await this.removeUserFromRoom(roomId, userId);
      }
      
      this._logger.debug('User disconnect handled', { userId, roomId });
    } catch (error: any) {
      this._logger.error('Failed to handle user disconnect', { error: error.message, userId, roomId });
    }
  }
}