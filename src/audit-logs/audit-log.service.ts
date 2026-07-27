import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { AuditLog, AuditLogDocument } from './schemas/audit-log.schema';
import {
  inferAuditCategory,
  normalizeAuditAction,
  sanitizeAuditValue,
} from './audit-log.util';

export interface AuditLogQuery {
  tenantId?: string;
  userId?: string;
  action?: string;
  category?: string;
  startDate?: string;
  endDate?: string;
  success?: string | boolean;
}

export interface AuditLogInput {
  actor?: AuthenticatedUser;
  actorUserId?: string;
  actorEmail?: string;
  actorRole?: string;
  tenantId?: string;
  action: string;
  category?: string;
  entityType: string;
  entityId: string;
  entityName?: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  success?: boolean;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditLogService {
  constructor(
    @InjectModel(AuditLog.name)
    private readonly auditLogModel: Model<AuditLogDocument>,
  ) {}

  async log(input: AuditLogInput): Promise<AuditLogDocument> {
    const action = normalizeAuditAction(input.action);
    const metadata = sanitizeAuditValue(input.metadata ?? {});

    return this.auditLogModel.create({
      actorUserId: input.actor?.sub ?? input.actorUserId ?? 'system',
      actorEmail: input.actor?.email ?? input.actorEmail,
      actorRole: input.actor?.roles?.[0] ?? input.actorRole ?? 'unknown',
      tenantId: input.tenantId ?? input.actor?.tenantId,
      action,
      category: input.category ?? inferAuditCategory(action, input.entityType),
      entityType: input.entityType,
      entityId: input.entityId,
      entityName: input.entityName,
      oldValues: sanitizeAuditValue(input.oldValues ?? {}),
      newValues: sanitizeAuditValue(input.newValues ?? {}),
      success: input.success !== false,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      metadata,
    });
  }

  logSuccess(input: Omit<AuditLogInput, 'success'>): Promise<AuditLogDocument> {
    return this.log({ ...input, success: true });
  }

  logFailure(input: Omit<AuditLogInput, 'success'>): Promise<AuditLogDocument> {
    return this.log({ ...input, success: false });
  }

  async findPlatform(query: AuditLogQuery = {}): Promise<AuditLogDocument[]> {
    return this.auditLogModel
      .find(this.toFilter(query))
      .sort({ createdAt: -1 })
      .limit(500)
      .exec();
  }

  async findPlatformById(id: string): Promise<AuditLogDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Audit-Eintrag nicht gefunden');
    }

    const log = await this.auditLogModel.findById(id).exec();
    if (!log) {
      throw new NotFoundException('Audit-Eintrag nicht gefunden');
    }
    return log;
  }

  private toFilter(query: AuditLogQuery): Record<string, unknown> {
    const filter: Record<string, unknown> = {};

    if (query.tenantId) filter.tenantId = query.tenantId;
    if (query.userId) filter.actorUserId = query.userId;
    if (query.action) filter.action = normalizeAuditAction(query.action);
    if (query.category) filter.category = query.category;
    if (query.success !== undefined && query.success !== '') {
      filter.success = query.success === true || query.success === 'true';
    }

    const createdAt: Record<string, Date> = {};
    if (query.startDate) createdAt.$gte = new Date(query.startDate);
    if (query.endDate) createdAt.$lte = new Date(query.endDate);
    if (Object.keys(createdAt).length) filter.createdAt = createdAt;

    return filter;
  }
}
