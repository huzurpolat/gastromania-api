import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AccessPolicyService } from '../access/access-policy.service';
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { User, UserDocument } from '../users/schemas/user.schema';
import {
  CreateApplicantDto,
  CreateEmployeeDocumentDto,
  CreateFeedbackDto,
  UpdateApplicantDto,
  UpdateEmployeeDocumentDto,
  UpdateFeedbackDto,
} from './dto/hr.dto';
import {
  EmployeeDocumentRecord,
  EmployeeDocumentRecordDocument,
} from './schemas/employee-document.schema';
import {
  EmployeeFeedback,
  EmployeeFeedbackDocument,
} from './schemas/employee-feedback.schema';
import {
  ApplicantStatus,
  JobApplicant,
  JobApplicantDocument,
} from './schemas/job-applicant.schema';

export interface HrFilters {
  employeeId?: string;
  locationId?: string;
  status?: string;
  category?: string;
  search?: string;
}

@Injectable()
export class HrService {
  constructor(
    @InjectModel(EmployeeDocumentRecord.name)
    private readonly documentModel: Model<EmployeeDocumentRecordDocument>,
    @InjectModel(JobApplicant.name)
    private readonly applicantModel: Model<JobApplicantDocument>,
    @InjectModel(EmployeeFeedback.name)
    private readonly feedbackModel: Model<EmployeeFeedbackDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  async findDocuments(actor: AuthenticatedUser, filters: HrFilters = {}) {
    const query = await this.scopedEmployeeQuery(actor, filters);
    if (filters.category) query.category = filters.category;
    return this.documentModel
      .find(query)
      .sort({ expiresAt: 1, createdAt: -1 })
      .exec();
  }

  async createDocument(
    payload: CreateEmployeeDocumentDto,
    actor: AuthenticatedUser,
  ) {
    const employee = await this.getEmployeeForWrite(actor, payload.employeeId);
    const locationId =
      payload.locationId ?? employee.locationId ?? employee.locationIds?.[0];
    if (locationId)
      await this.accessPolicy.assertCanAccessLocation(actor, locationId);
    return this.documentModel.create({
      ...payload,
      locationId,
      companyId: employee.companyId ?? actor.companyId,
      issuedAt: payload.issuedAt ? new Date(payload.issuedAt) : undefined,
      expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : undefined,
      createdBy: actor.sub,
    });
  }

  async updateDocument(
    id: string,
    payload: UpdateEmployeeDocumentDto,
    actor: AuthenticatedUser,
  ) {
    const document = await this.documentModel.findById(id).exec();
    if (!document) throw new NotFoundException('Dokument nicht gefunden');
    await this.getEmployeeForWrite(actor, document.employeeId);
    if (payload.employeeId)
      await this.getEmployeeForWrite(actor, payload.employeeId);
    const updated = await this.documentModel
      .findByIdAndUpdate(
        id,
        {
          ...payload,
          issuedAt: payload.issuedAt ? new Date(payload.issuedAt) : undefined,
          expiresAt: payload.expiresAt
            ? new Date(payload.expiresAt)
            : undefined,
        },
        { new: true, runValidators: true },
      )
      .exec();
    if (!updated) throw new NotFoundException('Dokument nicht gefunden');
    return updated;
  }

  async removeDocument(id: string, actor: AuthenticatedUser): Promise<void> {
    const document = await this.documentModel.findById(id).exec();
    if (!document) throw new NotFoundException('Dokument nicht gefunden');
    await this.getEmployeeForWrite(actor, document.employeeId);
    await this.documentModel.findByIdAndDelete(id).exec();
  }

  async findApplicants(actor: AuthenticatedUser, filters: HrFilters = {}) {
    const query: Record<string, unknown> = {};
    if (filters.locationId) {
      await this.accessPolicy.assertCanAccessLocation(
        actor,
        filters.locationId,
      );
      query.locationId = filters.locationId;
    } else {
      Object.assign(
        query,
        await this.accessPolicy.getScopedResourceFilter(actor),
      );
    }
    if (filters.status) query.status = filters.status;
    if (filters.search) {
      query.$or = [
        { firstName: new RegExp(filters.search, 'i') },
        { lastName: new RegExp(filters.search, 'i') },
        { email: new RegExp(filters.search, 'i') },
      ];
    }
    return this.applicantModel.find(query).sort({ createdAt: -1 }).exec();
  }

  async createApplicant(payload: CreateApplicantDto, actor: AuthenticatedUser) {
    if (payload.locationId) {
      await this.accessPolicy.assertCanAccessLocation(
        actor,
        payload.locationId,
      );
    }
    return this.applicantModel.create({
      ...payload,
      email: payload.email.toLowerCase(),
      companyId: actor.companyId,
      status: payload.status ?? ApplicantStatus.New,
      interviewAt: payload.interviewAt
        ? new Date(payload.interviewAt)
        : undefined,
      trialWorkAt: payload.trialWorkAt
        ? new Date(payload.trialWorkAt)
        : undefined,
      requestedDocuments: payload.requestedDocuments ?? [],
      onboardingChecklist: payload.onboardingChecklist ?? [],
      createdBy: actor.sub,
    });
  }

  async updateApplicant(
    id: string,
    payload: UpdateApplicantDto,
    actor: AuthenticatedUser,
  ) {
    const applicant = await this.applicantModel.findById(id).exec();
    if (!applicant) throw new NotFoundException('Bewerber nicht gefunden');
    if (applicant.locationId) {
      await this.accessPolicy.assertCanAccessLocation(
        actor,
        applicant.locationId,
      );
    }
    if (payload.locationId) {
      await this.accessPolicy.assertCanAccessLocation(
        actor,
        payload.locationId,
      );
    }
    const updated = await this.applicantModel
      .findByIdAndUpdate(
        id,
        {
          ...payload,
          email: payload.email?.toLowerCase(),
          interviewAt: payload.interviewAt
            ? new Date(payload.interviewAt)
            : undefined,
          trialWorkAt: payload.trialWorkAt
            ? new Date(payload.trialWorkAt)
            : undefined,
        },
        { new: true, runValidators: true },
      )
      .exec();
    if (!updated) throw new NotFoundException('Bewerber nicht gefunden');
    return updated;
  }

  async findFeedback(actor: AuthenticatedUser, filters: HrFilters = {}) {
    const query = await this.scopedEmployeeQuery(actor, filters);
    return this.feedbackModel.find(query).sort({ createdAt: -1 }).exec();
  }

  async createFeedback(payload: CreateFeedbackDto, actor: AuthenticatedUser) {
    const employee = await this.getEmployeeForWrite(actor, payload.employeeId);
    const locationId =
      payload.locationId ?? employee.locationId ?? employee.locationIds?.[0];
    if (locationId)
      await this.accessPolicy.assertCanAccessLocation(actor, locationId);
    return this.feedbackModel.create({
      ...payload,
      companyId: employee.companyId ?? actor.companyId,
      locationId,
      goals: payload.goals ?? [],
      developmentActions: payload.developmentActions ?? [],
      dueDate: payload.dueDate ? new Date(payload.dueDate) : undefined,
      createdBy: actor.sub,
    });
  }

  async updateFeedback(
    id: string,
    payload: UpdateFeedbackDto,
    actor: AuthenticatedUser,
  ) {
    const feedback = await this.feedbackModel.findById(id).exec();
    if (!feedback) throw new NotFoundException('Feedback nicht gefunden');
    await this.getEmployeeForWrite(actor, feedback.employeeId);
    const updated = await this.feedbackModel
      .findByIdAndUpdate(
        id,
        {
          ...payload,
          dueDate: payload.dueDate ? new Date(payload.dueDate) : undefined,
        },
        { new: true, runValidators: true },
      )
      .exec();
    if (!updated) throw new NotFoundException('Feedback nicht gefunden');
    return updated;
  }

  async summary(actor: AuthenticatedUser, locationId?: string) {
    const [documents, applicants, feedback] = await Promise.all([
      this.findDocuments(actor, { locationId }),
      this.findApplicants(actor, { locationId }),
      this.findFeedback(actor, { locationId }),
    ]);
    const now = Date.now();
    const soon = now + 30 * 86_400_000;
    return {
      documentsTotal: documents.length,
      expiringDocuments: documents.filter(
        (item) => item.expiresAt && item.expiresAt.getTime() <= soon,
      ).length,
      openApplicants: applicants.filter(
        (item) =>
          ![ApplicantStatus.Hired, ApplicantStatus.Rejected].includes(
            item.status,
          ),
      ).length,
      onboardingOpen: applicants.filter(
        (item) =>
          item.status === ApplicantStatus.Hired &&
          item.onboardingChecklist.length,
      ).length,
      feedbackTotal: feedback.length,
      openGoals: feedback.filter(
        (item) => item.dueDate && item.dueDate.getTime() >= now,
      ).length,
    };
  }

  async export(actor: AuthenticatedUser, locationId?: string) {
    const summary = await this.summary(actor, locationId);
    const rows = [['Kennzahl', 'Wert'], ...Object.entries(summary)];
    return {
      filename: 'gastromania-hr-report.csv',
      mimeType: 'text/csv; charset=utf-8',
      content: rows
        .map((row) => row.map((cell) => `"${String(cell)}"`).join(';'))
        .join('\n'),
    };
  }

  private async scopedEmployeeQuery(
    actor: AuthenticatedUser,
    filters: HrFilters,
  ) {
    const query: Record<string, unknown> = {};
    if (filters.employeeId) {
      await this.getEmployeeForRead(actor, filters.employeeId);
      query.employeeId = filters.employeeId;
      return query;
    }
    if (filters.locationId) {
      await this.accessPolicy.assertCanAccessLocation(
        actor,
        filters.locationId,
      );
      query.locationId = filters.locationId;
      return query;
    }
    if (this.accessPolicy.isPlatformAdmin(actor)) {
      throw new ForbiddenException('Nicht ausreichende Berechtigung');
    }
    const locationIds = await this.accessPolicy.getReadableLocationIds(actor);
    return locationIds.length
      ? { locationId: { $in: locationIds } }
      : { employeeId: actor.sub };
  }

  private async getEmployeeForRead(
    actor: AuthenticatedUser,
    employeeId: string,
  ) {
    const employee = await this.userModel.findById(employeeId).exec();
    if (!employee) throw new NotFoundException('Mitarbeiter nicht gefunden');
    if (
      employeeId === actor.sub ||
      (await this.accessPolicy.canManageUser(actor, employee))
    ) {
      return employee;
    }
    throw new ForbiddenException('Keine Berechtigung fuer diesen Mitarbeiter');
  }

  private async getEmployeeForWrite(
    actor: AuthenticatedUser,
    employeeId: string,
  ) {
    const employee = await this.userModel.findById(employeeId).exec();
    if (!employee) throw new NotFoundException('Mitarbeiter nicht gefunden');
    await this.accessPolicy.assertCanManageUser(actor, employee);
    return employee;
  }
}
