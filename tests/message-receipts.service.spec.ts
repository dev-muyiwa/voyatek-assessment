import 'reflect-metadata';
import { Container } from 'inversify';
import { MessageReceiptsService } from '../src/app/messages/message-receipts.service';
import { Database } from '../src/config/db';
import { Logger } from '../src/config/logger';
import { LIB_TYPES } from '../src/di/types';

// Create a lightweight mock Prisma client shape for our calls
type AnyObject = Record<string, any>;

describe('MessageReceiptsService', () => {
  let container: Container;
  let service: MessageReceiptsService;
  let mockPrisma: AnyObject;
  let mockDb: AnyObject;
  let mockLogger: AnyObject;

  beforeEach(() => {
    container = new Container();

    mockLogger = {
      debug: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
    };

    mockPrisma = {
      room_members: {
        findMany: jest.fn(),
      },
      message_receipts: {
        createMany: jest.fn(),
        updateMany: jest.fn(),
        findMany: jest.fn(),
      },
    };

    mockDb = {
      connection: mockPrisma,
    };

    container.bind(LIB_TYPES.KnexDB).toConstantValue(mockDb as unknown as Database);
    container.bind(LIB_TYPES.Logger).toConstantValue(mockLogger as unknown as Logger);
    container.bind(MessageReceiptsService).toSelf();

    service = container.get(MessageReceiptsService);
  });

  test('createDeliveryReceipts creates receipts for all room members except sender', async () => {
    mockPrisma.room_members.findMany.mockResolvedValue([
      { member_id: 'user-1' },
      { member_id: 'user-2' },
      { member_id: 'sender-id' },
    ]);
    mockPrisma.message_receipts.createMany.mockResolvedValue({ count: 2 });

    await service.createDeliveryReceipts('msg-1', 'room-1', 'sender-id');

    expect(mockPrisma.room_members.findMany).toHaveBeenCalledWith({
      where: { room_id: 'room-1', member_id: { not: 'sender-id' }, deleted_at: null },
      select: { member_id: true },
    });
    expect(mockPrisma.message_receipts.createMany).toHaveBeenCalledWith({
      data: [
        { message_id: 'msg-1', recipient_id: 'user-1' },
        { message_id: 'msg-1', recipient_id: 'user-2' },
      ],
      skipDuplicates: true,
    });
  });

  test('markAsRead updates read_at for recipient', async () => {
    mockPrisma.message_receipts.updateMany.mockResolvedValue({ count: 1 });

    const updated = await service.markAsRead('msg-2', 'user-1');
    expect(updated).toBe(true);
    expect(mockPrisma.message_receipts.updateMany).toHaveBeenCalledWith({
      where: { message_id: 'msg-2', recipient_id: 'user-1' },
      data: { read_at: expect.any(Date) },
    });
  });

  test('markMultipleAsRead updates many', async () => {
    mockPrisma.message_receipts.updateMany.mockResolvedValue({ count: 3 });

    const count = await service.markMultipleAsRead(['m1', 'm2', 'm3'], 'user-1');
    expect(count).toBe(3);
    expect(mockPrisma.message_receipts.updateMany).toHaveBeenCalledWith({
      where: { message_id: { in: ['m1', 'm2', 'm3'] }, recipient_id: 'user-1', read_at: null },
      data: { read_at: expect.any(Date) },
    });
  });

  test('getUnreadMessages returns ids of unread', async () => {
    mockPrisma.message_receipts.findMany.mockResolvedValue([
      { message_id: 'm1' },
      { message_id: 'm2' },
    ]);

    const ids = await service.getUnreadMessages('user-1', 'room-1');
    expect(ids).toEqual(['m1', 'm2']);
    expect(mockPrisma.message_receipts.findMany).toHaveBeenCalledWith({
      where: { recipient_id: 'user-1', read_at: null, message: { room_id: 'room-1' } },
      select: { message_id: true },
      include: { message: { select: { room_id: true } } },
    });
  });
});

