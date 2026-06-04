import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { EmployeeDocumentCategory } from '../schemas/employee-document.schema';
import { FeedbackType } from '../schemas/employee-feedback.schema';
import { ApplicantStatus } from '../schemas/job-applicant.schema';

export class CreateEmployeeDocumentDto {
  @IsString()
  employeeId!: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsString()
  title!: string;

  @IsIn(Object.values(EmployeeDocumentCategory))
  category!: EmployeeDocumentCategory;

  @IsOptional()
  @IsString()
  fileName?: string;

  @IsOptional()
  @IsString()
  fileUrl?: string;

  @IsOptional()
  @IsDateString()
  issuedAt?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateEmployeeDocumentDto {
  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsIn(Object.values(EmployeeDocumentCategory))
  category?: EmployeeDocumentCategory;

  @IsOptional()
  @IsString()
  fileName?: string;

  @IsOptional()
  @IsString()
  fileUrl?: string;

  @IsOptional()
  @IsDateString()
  issuedAt?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateApplicantDto {
  @IsOptional()
  @IsString()
  locationId?: string;

  @IsString()
  firstName!: string;

  @IsString()
  lastName!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  targetRole?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsIn(Object.values(ApplicantStatus))
  status?: ApplicantStatus;

  @IsOptional()
  @IsDateString()
  interviewAt?: string;

  @IsOptional()
  @IsDateString()
  trialWorkAt?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requestedDocuments?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  onboardingChecklist?: string[];

  @IsOptional()
  @IsString()
  decisionNote?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateApplicantDto extends CreateApplicantDto {}

export class CreateFeedbackDto {
  @IsString()
  employeeId!: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsIn(Object.values(FeedbackType))
  type!: FeedbackType;

  @IsString()
  title!: string;

  @IsString()
  note!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  goals?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  developmentActions?: string[];

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

export class UpdateFeedbackDto {
  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsIn(Object.values(FeedbackType))
  type?: FeedbackType;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  goals?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  developmentActions?: string[];

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
