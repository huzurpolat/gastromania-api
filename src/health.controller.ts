import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { constants } from 'fs';
import { access, mkdir } from 'fs/promises';
import { Connection } from 'mongoose';
import { join } from 'path';

interface HealthResponse {
  status: 'ok' | 'degraded';
  database: 'connected' | 'disconnected';
  uploads: 'writable' | 'not_writable';
  uptimeSeconds: number;
  timestamp: string;
}

@Controller('health')
export class HealthController {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  @Get()
  async getHealth(): Promise<HealthResponse> {
    const database =
      this.connection.readyState === 1 ? 'connected' : 'disconnected';
    const uploads = await this.getUploadStatus();

    return {
      status: database === 'connected' && uploads === 'writable' ? 'ok' : 'degraded',
      database,
      uploads,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  private async getUploadStatus(): Promise<'writable' | 'not_writable'> {
    const uploadRoot = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');

    try {
      await mkdir(uploadRoot, { recursive: true });
      await access(uploadRoot, constants.W_OK);
      return 'writable';
    } catch {
      return 'not_writable';
    }
  }
}
