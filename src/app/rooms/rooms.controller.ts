import { controller, httpGet, httpPost } from 'inversify-express-utils';
import { Request, Response } from 'express';
import { inject } from 'inversify';
import { RoomsService } from './rooms.service';
import { Logger } from '../../config/logger';
import { BaseController } from '../../internal/base.controller';
import Default from '../defaults/default';
import { MIDDLEWARE_TYPES, LIB_TYPES, SERVICE_TYPES } from '../../di/types';
import {
  CreateRoomDto,
  GetRoomDto, GetRoomMessageDto,
  GetRoomMessagesDto,
  GetUserRoomsDto,
  InviteUserToRoomDto,
  JoinRoomDto,
} from './dto/room.dto';
import { validateOrReject } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { IAuthRecord } from '../../interfaces/interfaces';

@controller('/rooms', MIDDLEWARE_TYPES.AuthMiddleware, MIDDLEWARE_TYPES.RateLimitMiddleware)
export class RoomsController extends BaseController {
  constructor(
    @inject(SERVICE_TYPES.RoomsService) private readonly _roomService: RoomsService,
    @inject(LIB_TYPES.Logger) protected readonly _logger: Logger,
  ) {
    super(_logger);
  }

  @httpPost('/')
  public async create(req: Request, res: Response) {
    const requestId: string = Default.GENERATE_REQUEST_ID();
    const timestamp: string = new Date().toUTCString();
    const ip: string = req.ip as string;
    const userAgent: string = req.headers['user-agent'] as string;

    try {
      const dto: CreateRoomDto = plainToInstance(CreateRoomDto, req.body);
      await validateOrReject(dto);
      const room = await this._roomService.createRoom(req.user as IAuthRecord, dto, ip, userAgent, timestamp, requestId);
      this.sendSuccess(res, room, 'Room created', 201, timestamp, requestId);
    } catch (err) {
      this.sendError(res, requestId, err);
    }
  }

  @httpGet('/')
  public async list(req: Request, res: Response) {
    const requestId: string = Default.GENERATE_REQUEST_ID();
    const timestamp: string = new Date().toUTCString();
    const ip: string = req.ip as string;
    const userAgent: string = req.headers['user-agent'] as string;

    try {
      const dto: GetUserRoomsDto = plainToInstance(GetUserRoomsDto, req.query);
      await validateOrReject(dto);
      const rooms = await this._roomService.listUserRooms(req.user as IAuthRecord, dto, ip, userAgent, timestamp, requestId);
      this.sendSuccess(res, rooms, 'Rooms fetched', 200, timestamp, requestId);
    } catch (err) {
      this.sendError(res, requestId, err);
    }
  }

  @httpPost('/:roomId/join')
  public async join(req: Request, res: Response) {
    const requestId: string = Default.GENERATE_REQUEST_ID();
    const timestamp: string = new Date().toUTCString();
    const ip: string = req.ip as string;
    const userAgent: string = req.headers['user-agent'] as string;

    try {
      const dto: JoinRoomDto = plainToInstance(JoinRoomDto, { ...req.params, ...req.query });
      await validateOrReject(dto);
      const data = await this._roomService.joinRoom(req.user as IAuthRecord, dto, ip, userAgent, timestamp, requestId);
      this.sendSuccess(res, data, 'Joined room', 200, timestamp, requestId);
    } catch (err) {
      this.sendError(res, requestId, err);
    }
  }

  @httpPost('/:roomId/invitations/:inviteeId')
  public async invite(req: Request, res: Response) {
    const requestId: string = Default.GENERATE_REQUEST_ID();
    const timestamp: string = new Date().toUTCString();
    const ip: string = req.ip as string;
    const userAgent: string = req.headers['user-agent'] as string;

    try {
      const dto: InviteUserToRoomDto = plainToInstance(InviteUserToRoomDto, req.params);
      await validateOrReject(dto);
      const data = await this._roomService.inviteUserToRoom(req.user as IAuthRecord, dto, ip, userAgent, timestamp, requestId);
      this.sendSuccess(
        res,
        data,
        'Invite created successfully',
        201,
        timestamp,
        requestId,
      );
    } catch (err) {
      this.sendError(res, requestId, err);
    }
  }

  @httpGet('/:roomId/messages')
  public async getMessages(req: Request, res: Response) {
    const requestId: string = Default.GENERATE_REQUEST_ID();
    const timestamp: string = new Date().toUTCString();
    const ip: string = req.ip as string;
    const userAgent: string = req.headers['user-agent'] as string;

    try {
      const dto: GetRoomMessagesDto = plainToInstance(GetRoomMessagesDto, { ...req.params, ...req.query });
      await validateOrReject(dto);
      const messages = await this._roomService.getRoomMessages(
        req.user as IAuthRecord,
        dto,
        ip,
        userAgent,
        timestamp,
        requestId,
      );
      this.sendSuccess(res, messages, 'Messages fetched', 200, timestamp, requestId);
    } catch (err) {
      this.sendError(res, requestId, err);
    }
  }

  @httpGet('/:roomId/members')
  public async getMembers(req: Request, res: Response) {
    const requestId: string = Default.GENERATE_REQUEST_ID();
    const timestamp: string = new Date().toUTCString();
    const ip: string = req.ip as string;
    const userAgent: string = req.headers['user-agent'] as string;

    try {
      const dto: GetRoomDto = plainToInstance(GetRoomDto, req.params);
      await validateOrReject(dto);
      const members = await this._roomService.getRoomMembers(
        req.user as IAuthRecord,
        dto,
        ip,
        userAgent,
        timestamp,
        requestId,
      );
      this.sendSuccess(res, members, 'Room members fetched', 200, timestamp, requestId);
    } catch (err) {
      this.sendError(res, requestId, err);
    }
  }

  @httpGet('/:roomId/presence')
  public async getRoomPresence(req: Request, res: Response) {
    const requestId: string = Default.GENERATE_REQUEST_ID();
    const timestamp: string = new Date().toUTCString();
    const ip: string = req.ip as string;
    const userAgent: string = req.headers['user-agent'] as string;

    try {
      const dto: GetRoomDto = plainToInstance(GetRoomDto, req.params);
      await validateOrReject(dto);
      const presence = await this._roomService.getRoomPresence(
        req.user as IAuthRecord,
        dto,
        ip,
        userAgent,
        timestamp,
        requestId,
      );
      this.sendSuccess(res, presence, 'Room presence fetched', 200, timestamp, requestId);
    } catch (err) {
      this.sendError(res, requestId, err);
    }
  }

  @httpGet('/:roomId/messages/:messageId/receipts')
  public async getMessageReceipts(req: Request, res: Response) {
    const requestId: string = Default.GENERATE_REQUEST_ID();
    const timestamp: string = new Date().toUTCString();
    const ip: string = req.ip as string;
    const userAgent: string = req.headers['user-agent'] as string;

    try {
      const dto: GetRoomMessageDto = plainToInstance(GetRoomMessageDto, req.params);
      await validateOrReject(dto);
      const receipts = await this._roomService.getMessageReceipts(
        req.user as IAuthRecord,
        dto,
        ip,
        userAgent,
        timestamp,
        requestId,
      );
      this.sendSuccess(res, receipts, 'Message receipts fetched', 200, timestamp, requestId);
    } catch (err) {
      this.sendError(res, requestId, err);
    }
  }
}

