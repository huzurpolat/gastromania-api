import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AccessPolicyService } from '../access/access-policy.service';
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { Company, CompanyDocument } from './schemas/company.schema';

@Injectable()
export class CompaniesService {
  constructor(
    @InjectModel(Company.name)
    private readonly companyModel: Model<CompanyDocument>,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  async create(dto: CreateCompanyDto, actor: AuthenticatedUser) {
    if (!this.accessPolicy.isPlatformAdmin(actor)) {
      throw new ForbiddenException(
        'Nur Platform-Admins duerfen Unternehmen anlegen',
      );
    }

    return this.companyModel.create(dto);
  }

  async findAll(actor: AuthenticatedUser) {
    if (this.accessPolicy.isPlatformAdmin(actor)) {
      return this.companyModel.find().sort({ name: 1 }).exec();
    }

    if (!actor.companyId) {
      return [];
    }

    return this.companyModel
      .find({ _id: actor.companyId })
      .sort({ name: 1 })
      .exec();
  }

  async findOne(id: string, actor: AuthenticatedUser) {
    this.validateObjectId(id);
    if (!this.accessPolicy.canAccessCompany(actor, id)) {
      throw new NotFoundException('Unternehmen nicht gefunden');
    }

    const company = await this.companyModel.findById(id).exec();
    if (!company) {
      throw new NotFoundException('Unternehmen nicht gefunden');
    }

    return company;
  }

  async update(id: string, dto: UpdateCompanyDto, actor: AuthenticatedUser) {
    this.validateObjectId(id);
    if (!this.accessPolicy.isPlatformAdmin(actor)) {
      throw new ForbiddenException(
        'Nur Platform-Admins duerfen Unternehmen bearbeiten',
      );
    }

    const company = await this.companyModel
      .findByIdAndUpdate(id, dto, { new: true, runValidators: true })
      .exec();
    if (!company) {
      throw new NotFoundException('Unternehmen nicht gefunden');
    }

    return company;
  }

  private validateObjectId(id: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Ungueltige Unternehmens-ID');
    }
  }
}
