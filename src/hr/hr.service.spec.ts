import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { AccessPolicyService } from '../access/access-policy.service';
import { Role } from '../auth/enums/role.enum';
import { User } from '../users/schemas/user.schema';
import {
  EmployeeDocumentCategory,
  EmployeeDocumentRecord,
} from './schemas/employee-document.schema';
import {
  EmployeeFeedback,
  FeedbackType,
} from './schemas/employee-feedback.schema';
import { ApplicantStatus, JobApplicant } from './schemas/job-applicant.schema';
import { HrService } from './hr.service';

function sortedQuery<T>(value: T) {
  return {
    sort: jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue(value),
    }),
  };
}

function execQuery<T>(value: T) {
  return {
    exec: jest.fn().mockResolvedValue(value),
  };
}

describe('HrService', () => {
  let service: HrService;
  const actor = {
    sub: 'manager-1',
    email: 'leitung@test.local',
    roles: [Role.Filialleiter],
    permissions: ['hrDocuments.view', 'hrDocuments.create'],
    companyId: 'company-1',
    locationIds: ['loc-1'],
    managedLocationIds: ['loc-1'],
  };
  const employee = {
    _id: { toString: () => 'employee-1' },
    companyId: 'company-1',
    email: 'sam@test.local',
    firstName: 'Sam',
    lastName: 'Service',
    role: Role.Service,
    roles: [Role.Service],
    locationId: 'loc-1',
    locationIds: ['loc-1'],
  };
  const documentModel = {
    find: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    findByIdAndDelete: jest.fn(),
    create: jest.fn(),
  };
  const applicantModel = {
    find: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    create: jest.fn(),
  };
  const feedbackModel = {
    find: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    create: jest.fn(),
  };
  const userModel = {
    findById: jest.fn(),
  };
  const accessPolicy = {
    assertCanAccessLocation: jest.fn(),
    assertCanManageUser: jest.fn(),
    canManageUser: jest.fn(),
    getReadableLocationIds: jest.fn(),
    getScopedResourceFilter: jest.fn(),
    isPlatformAdmin: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const soon = new Date(Date.now() + 14 * 86_400_000);
    const later = new Date(Date.now() + 45 * 86_400_000);
    documentModel.find.mockReturnValue(
      sortedQuery([
        { employeeId: 'employee-1', locationId: 'loc-1', expiresAt: soon },
        { employeeId: 'employee-2', locationId: 'loc-1', expiresAt: later },
      ]),
    );
    applicantModel.find.mockReturnValue(
      sortedQuery([
        {
          locationId: 'loc-1',
          status: ApplicantStatus.Interview,
          onboardingChecklist: [],
        },
        {
          locationId: 'loc-1',
          status: ApplicantStatus.Hired,
          onboardingChecklist: ['Vertrag'],
        },
      ]),
    );
    feedbackModel.find.mockReturnValue(
      sortedQuery([
        {
          employeeId: 'employee-1',
          locationId: 'loc-1',
          type: FeedbackType.Goal,
          dueDate: later,
        },
      ]),
    );
    userModel.findById.mockReturnValue(execQuery(employee));
    accessPolicy.assertCanAccessLocation.mockResolvedValue(undefined);
    accessPolicy.assertCanManageUser.mockResolvedValue(undefined);
    accessPolicy.canManageUser.mockResolvedValue(true);
    accessPolicy.getReadableLocationIds.mockResolvedValue(['loc-1']);
    accessPolicy.getScopedResourceFilter.mockResolvedValue({
      locationId: { $in: ['loc-1'] },
    });
    accessPolicy.isPlatformAdmin.mockReturnValue(false);

    const moduleRef = await Test.createTestingModule({
      providers: [
        HrService,
        {
          provide: getModelToken(EmployeeDocumentRecord.name),
          useValue: documentModel,
        },
        { provide: getModelToken(JobApplicant.name), useValue: applicantModel },
        {
          provide: getModelToken(EmployeeFeedback.name),
          useValue: feedbackModel,
        },
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: AccessPolicyService, useValue: accessPolicy },
      ],
    }).compile();

    service = moduleRef.get(HrService);
  });

  it('summarizes HR documents, recruiting and feedback within location scope', async () => {
    const summary = await service.summary(actor, 'loc-1');

    expect(summary).toEqual({
      documentsTotal: 2,
      expiringDocuments: 1,
      openApplicants: 1,
      onboardingOpen: 1,
      feedbackTotal: 1,
      openGoals: 1,
    });
    expect(accessPolicy.assertCanAccessLocation).toHaveBeenCalledWith(
      actor,
      'loc-1',
    );
    expect(documentModel.find).toHaveBeenCalledWith({ locationId: 'loc-1' });
    expect(applicantModel.find).toHaveBeenCalledWith({ locationId: 'loc-1' });
    expect(feedbackModel.find).toHaveBeenCalledWith({ locationId: 'loc-1' });
  });

  it('creates scoped employee documents with audit ownership', async () => {
    documentModel.create.mockImplementation((payload) =>
      Promise.resolve(payload),
    );

    const result = await service.createDocument(
      {
        employeeId: 'employee-1',
        title: 'Hygienebelehrung',
        category: EmployeeDocumentCategory.Hygiene,
        expiresAt: '2026-07-01T00:00:00.000Z',
      },
      actor,
    );

    expect(accessPolicy.assertCanManageUser).toHaveBeenCalledWith(
      actor,
      employee,
    );
    expect(documentModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        employeeId: 'employee-1',
        title: 'Hygienebelehrung',
        category: EmployeeDocumentCategory.Hygiene,
        companyId: 'company-1',
        locationId: 'loc-1',
        createdBy: 'manager-1',
      }),
    );
    expect(result).toEqual(expect.objectContaining({ createdBy: 'manager-1' }));
  });
});
