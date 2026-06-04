import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DEFAULT_MODULES } from './constants/module-definitions';
import {
  SystemModule,
  SystemModuleDocument,
} from './schemas/system-module.schema';

@Injectable()
export class ModulesService implements OnModuleInit {
  constructor(
    @InjectModel(SystemModule.name)
    private readonly moduleModel: Model<SystemModuleDocument>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedDefaults();
  }

  async findAll(): Promise<SystemModuleDocument[]> {
    await this.seedDefaults();

    return this.moduleModel.find().sort({ category: 1, name: 1 }).exec();
  }

  async getStatus(): Promise<Array<{ key: string; enabled: boolean }>> {
    await this.seedDefaults();
    const modules = await this.moduleModel
      .find({}, { key: 1, enabled: 1, _id: 0 })
      .lean()
      .exec();

    return modules.map((moduleConfig) => ({
      key: moduleConfig.key,
      enabled: moduleConfig.enabled,
    }));
  }

  async updateEnabled(
    key: string,
    enabled: boolean,
  ): Promise<SystemModuleDocument> {
    const moduleConfig = await this.moduleModel.findOne({ key }).exec();

    if (!moduleConfig) {
      throw new NotFoundException('Modul nicht gefunden');
    }

    if (moduleConfig.systemLocked && !enabled) {
      throw new ForbiddenException(
        'Systemkritisches Modul darf nicht deaktiviert werden',
      );
    }

    moduleConfig.enabled = enabled;

    return moduleConfig.save();
  }

  async isEnabled(key: string): Promise<boolean> {
    const moduleConfig = await this.moduleModel.findOne({ key }).exec();

    if (!moduleConfig) {
      return false;
    }

    return moduleConfig.enabled;
  }

  async assertEnabled(key: string): Promise<void> {
    const enabled = await this.isEnabled(key);

    if (!enabled) {
      throw new ForbiddenException(`Modul ${key} ist deaktiviert`);
    }
  }

  private async seedDefaults(): Promise<void> {
    await Promise.all(
      DEFAULT_MODULES.map((definition) =>
        this.moduleModel
          .updateOne(
            { key: definition.key },
            {
              $set: {
                name: definition.name,
                description: definition.description,
                category: definition.category,
                systemLocked: definition.systemLocked,
              },
              $setOnInsert: {
                key: definition.key,
                enabled: definition.enabled,
              },
            },
            { upsert: true },
          )
          .exec(),
      ),
    );
  }
}
