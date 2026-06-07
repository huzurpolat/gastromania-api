import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Location,
  LocationDocument,
} from '../locations/schemas/location.schema';
import {
  RestaurantTable,
  RestaurantTableDocument,
} from '../tables/schemas/table.schema';
import {
  Order,
  OrderDocument,
  OrderTenantResolutionStatus,
} from './schemas/order.schema';

type LegacyOrderCandidate = {
  _id: unknown;
  locationId?: string;
  tableId?: string;
};

@Injectable()
export class OrderTenantBackfillService implements OnApplicationBootstrap {
  private readonly logger = new Logger(OrderTenantBackfillService.name);
  private readonly missingTenantFilter = {
    $or: [
      { tenantId: { $exists: false } },
      { tenantId: null },
      { tenantId: '' },
    ],
  };

  constructor(
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
    @InjectModel(Location.name)
    private readonly locationModel: Model<LocationDocument>,
    @InjectModel(RestaurantTable.name)
    private readonly tableModel: Model<RestaurantTableDocument>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.backfillTenantIds();
  }

  private async backfillTenantIds(): Promise<void> {
    try {
      const locations = await this.locationModel
        .find({ tenantId: { $exists: true, $nin: [null, ''] } })
        .select('_id tenantId')
        .lean()
        .exec();

      const tenantByLocationId = new Map<string, string>();
      for (const location of locations) {
        if (location.tenantId) {
          tenantByLocationId.set(String(location._id), location.tenantId);
        }
      }

      const tables = await this.tableModel
        .find({
          $or: [
            { tenantId: { $exists: true, $nin: [null, ''] } },
            { locationId: { $exists: true, $nin: [null, ''] } },
          ],
        })
        .select('_id tenantId locationId')
        .lean()
        .exec();

      const tenantByTableId = new Map<string, string>();
      const ambiguousTableIds = new Set<string>();
      for (const table of tables) {
        const candidates = new Set<string>();
        if (table.tenantId) {
          candidates.add(table.tenantId);
        }
        const locationTenantId = tenantByLocationId.get(String(table.locationId));
        if (locationTenantId) {
          candidates.add(locationTenantId);
        }

        if (candidates.size === 1) {
          tenantByTableId.set(String(table._id), [...candidates][0]);
        } else if (candidates.size > 1) {
          ambiguousTableIds.add(String(table._id));
        }
      }

      const legacyOrders = await this.orderModel
        .find(this.missingTenantFilter)
        .select('_id locationId tableId')
        .lean()
        .exec();
      const now = new Date();
      let resolvedCount = 0;
      let orphanedCount = 0;

      for (const order of legacyOrders) {
        const resolution = this.resolveTenantCandidate(
          order,
          tenantByLocationId,
          tenantByTableId,
          ambiguousTableIds,
        );

        if (resolution.tenantId) {
          await this.orderModel
            .updateOne(
              { _id: order._id },
              {
                $set: {
                  tenantId: resolution.tenantId,
                  tenantResolutionStatus: OrderTenantResolutionStatus.Resolved,
                  tenantResolvedAt: now,
                },
                $unset: { tenantResolutionReason: '' },
              },
            )
            .exec();
          resolvedCount += 1;
          continue;
        }

        await this.orderModel
          .updateOne(
            { _id: order._id },
            {
              $set: {
                tenantResolutionStatus:
                  OrderTenantResolutionStatus.LegacyOrphan,
                tenantResolutionReason: resolution.reason,
                tenantResolvedAt: now,
              },
            },
          )
          .exec();
        orphanedCount += 1;
      }

      const unsafeUnmarkedCount = await this.orderModel
        .countDocuments({
          ...this.missingTenantFilter,
          tenantResolutionStatus: {
            $ne: OrderTenantResolutionStatus.LegacyOrphan,
          },
        })
        .exec();
      const legacyOrphanCount = await this.orderModel
        .countDocuments({
          ...this.missingTenantFilter,
          tenantResolutionStatus: OrderTenantResolutionStatus.LegacyOrphan,
        })
        .exec();

      if (resolvedCount > 0 || orphanedCount > 0) {
        this.logger.log(
          `Order tenantId backfill: ${resolvedCount} sicher zugeordnet, ${orphanedCount} als Legacy/Orphan markiert.`,
        );
      }

      if (unsafeUnmarkedCount > 0) {
        this.logger.warn(
          `${unsafeUnmarkedCount} Orders ohne tenantId sind noch nicht als Legacy/Orphan markiert.`,
        );
      } else if (legacyOrphanCount > 0) {
        this.logger.log(
          `${legacyOrphanCount} Legacy/Orphan Orders bleiben tenantlos und werden operativ ausgeschlossen.`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Order tenantId backfill wurde uebersprungen: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private resolveTenantCandidate(
    order: LegacyOrderCandidate,
    tenantByLocationId: Map<string, string>,
    tenantByTableId: Map<string, string>,
    ambiguousTableIds: Set<string>,
  ): { tenantId?: string; reason: string } {
    const candidates = new Set<string>();
    const evidence: string[] = [];

    if (order.locationId) {
      const locationTenantId = tenantByLocationId.get(String(order.locationId));
      if (locationTenantId) {
        candidates.add(locationTenantId);
        evidence.push(`locationId:${order.locationId}`);
      }
    }

    if (order.tableId) {
      const tableId = String(order.tableId);
      if (ambiguousTableIds.has(tableId)) {
        return {
          reason:
            'tableId verweist auf widerspruechliche Tenant-Zuordnungen',
        };
      }

      const tableTenantId = tenantByTableId.get(tableId);
      if (tableTenantId) {
        candidates.add(tableTenantId);
        evidence.push(`tableId:${tableId}`);
      }
    }

    if (candidates.size === 1) {
      return {
        tenantId: [...candidates][0],
        reason: `Tenant eindeutig ueber ${evidence.join(' und ')} ermittelt`,
      };
    }

    if (candidates.size > 1) {
      return {
        reason:
          'locationId und tableId liefern unterschiedliche Tenant-Kandidaten',
      };
    }

    return {
      reason:
        'locationId/tableId konnten keinem Tenant eindeutig zugeordnet werden',
    };
  }
}
