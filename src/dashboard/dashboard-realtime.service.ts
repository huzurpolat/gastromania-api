import { Injectable } from '@nestjs/common';
import { RealtimeService } from '../realtime/realtime.service';

@Injectable()
export class DashboardRealtimeService {
  constructor(private readonly realtimeService: RealtimeService) {}

  publishRefresh(locationId?: string): void {
    this.realtimeService.publish('dashboard.refresh', { locationId });
  }
}
