import { inject, injectable } from 'inversify';
import { LIB_TYPES } from '../../di/types';
import { Database } from '../../config/db';
import { Logger } from '../../config/logger';
import { PrismaClient } from '@prisma/client';
import { BaseService } from '../../internal/base.service';

export interface MessageReceiptInfo {
  messageId: string;
  recipientId: string;
  read: boolean;
  readAt?: string;
}

export interface MessageWithReceipts {
  id: string;
  content: string;
  createdAt: string;
  sender: {
    id: string;
    username: string;
    first_name: string;
    last_name: string;
  };
  receipts: MessageReceiptInfo[];
  readStatus: {
    totalRecipients: number;
    readCount: number;
  };
}

@injectable()
export class MessageReceiptsService extends BaseService {
  private _client: PrismaClient;

  constructor(
    @inject(LIB_TYPES.KnexDB) private readonly _db: Database,
    @inject(LIB_TYPES.Logger) private readonly _logger: Logger,
  ) {
    super(_logger);
    this._client = this._db.connection;
  }

  async createDeliveryReceipts(messageId: string, roomId: string, senderId: string): Promise<void> {
    this.action = 'CREATE_MESSAGE_RECEIPTS';
    try {
      // Get all room members except the sender
      const roomMembers = await this._client.room_members.findMany({
        where: {
          room_id: roomId,
          member_id: { not: senderId },
          deleted_at: null,
        },
        select: { member_id: true },
      });

      if (roomMembers.length === 0) {
        this._logger.debug('No recipients found for message receipts', { messageId, roomId });
        return;
      }

      // Create receipt records for each recipient; DB will set delivered_at by default
      // Extra defensive filter to ensure the sender never gets a receipt
      const recipientIds = roomMembers
        .map(member => member.member_id)
        .filter(memberId => memberId !== senderId);

      if (recipientIds.length === 0) {
        this._logger.debug('No non-sender recipients for message receipts', { messageId, roomId });
        return;
      }

      const receiptData = recipientIds.map(recipient_id => ({
        message_id: messageId,
        recipient_id,
      }));

      await this._client.message_receipts.createMany({
        data: receiptData,
        skipDuplicates: true,
      });

      this.logDebug('Created message receipts', { messageId, roomId }, { recipientCount: recipientIds.length });
    } catch (error: any) {
      this.logError('Failed to create message receipts', { messageId, roomId }, { error: error.message, senderId });
    }
  }

  async markAsRead(messageId: string, userId: string): Promise<boolean> {
    this.action = 'MARK_MESSAGE_READ';
    try {
      const result = await this._client.message_receipts.updateMany({
        where: {
          message_id: messageId,
          recipient_id: userId,
        },
        data: {
          read_at: new Date(),
        },
      });

      const updated = result.count > 0;
      if (updated) this.logDebug('Marked message as read', { messageId, userId }, {});

      return updated;
    } catch (error: any) {
      this.logError('Failed to mark message as read', { messageId, userId }, { error: error.message });
      return false;
    }
  }

  async getMessageReceipts(messageId: string): Promise<MessageReceiptInfo[]> {
    this.action = 'GET_MESSAGE_RECEIPTS';
    try {
      const receipts = await this._client.message_receipts.findMany({
        where: { message_id: messageId },
        include: {
          recipient: {
            select: {
              id: true,
              username: true,
              first_name: true,
              last_name: true,
            },
          },
        },
      });

      return receipts.map(receipt => ({
        messageId: receipt.message_id,
        recipientId: receipt.recipient_id,
        read: !!receipt.read_at,
        readAt: receipt.read_at?.toISOString(),
        recipient: receipt.recipient,
      }));
    } catch (error: any) {
      this.logError('Failed to get message receipts', { messageId }, { error: error.message });
      return [];
    }
  }

  async getMessagesWithReceipts(messageIds: string[]): Promise<Map<string, any>> {
    this.action = 'GET_MESSAGES_WITH_RECEIPTS';
    try {
      const receipts = await this._client.message_receipts.findMany({
        where: { message_id: { in: messageIds } },
        select: {
          message_id: true,
          read_at: true,
        },
      });

      const receiptMap = new Map<string, any>();

      messageIds.forEach(messageId => {
        const messageReceipts = receipts.filter(r => r.message_id === messageId);
        const totalRecipients = messageReceipts.length;
        const readCount = messageReceipts.filter(r => r.read_at !== null).length;

        receiptMap.set(messageId, {
          totalRecipients,
          readCount,
          readStatus: totalRecipients > 0 ? 
            (readCount === totalRecipients ? 'all_read' : 
             readCount > 0 ? 'partially_read' : 'unread') : 'no_recipients',
        });
      });

      return receiptMap;
    } catch (error: any) {
      this.logError('Failed to get messages with receipts', { messageIds }, { error: error.message });
      return new Map();
    }
  }

  async markMultipleAsRead(messageIds: string[], userId: string): Promise<number> {
    this.action = 'MARK_MULTIPLE_READ';
    try {
      const result = await this._client.message_receipts.updateMany({
        where: {
          message_id: { in: messageIds },
          recipient_id: userId,
          read_at: null,
        },
        data: {
          read_at: new Date(),
        },
      });

      this.logDebug('Bulk marked messages as read', { userId }, { messageCount: result.count });

      return result.count;
    } catch (error: any) {
      this.logError('Failed to bulk mark messages as read', { userId }, { error: error.message, messageIds });
      return 0;
    }
  }

  async getUnreadMessages(userId: string, roomId?: string): Promise<string[]> {
    this.action = 'GET_UNREAD_MESSAGES';
    try {
      const whereCondition: any = {
        recipient_id: userId,
        read_at: null,
      };

      if (roomId) {
        whereCondition.message = {
          room_id: roomId,
        };
      }

      const unreadReceipts = await this._client.message_receipts.findMany({
        where: whereCondition,
        select: { message_id: true },
        ...(roomId && {
          include: {
            message: {
              select: { room_id: true },
            },
          },
        }),
      });

      return unreadReceipts.map(receipt => receipt.message_id);
    } catch (error: any) {
      this.logError('Failed to get unread messages', { userId, roomId }, { error: error.message });
      return [];
    }
  }

  // delivered state is implicit via DB default; no undelivered API
}