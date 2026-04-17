import {
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  IsBoolean,
  IsEnum,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Medicine type enum (mirrors Prisma MedicalItemType)
export enum MedicalItemTypeDto {
  MEDICINE = 'MEDICINE',
  EMERGENCY_SUPPLY = 'EMERGENCY_SUPPLY',
  MEDICAL_EQUIPMENT = 'MEDICAL_EQUIPMENT',
}

// DTOs for Medical Record Management
export class CreatePrescriptionDto {
  @ApiProperty({ description: 'Medicine ID' })
  @IsString()
  medicineId: string;

  @ApiProperty({ description: 'Quantity of medicine' })
  @IsNumber()
  quantity: number;

  @ApiPropertyOptional({ description: 'Dosage instruction' })
  @IsOptional()
  @IsString()
  dosage?: string;

  @ApiPropertyOptional({ description: 'Frequency of intake' })
  @IsOptional()
  @IsString()
  frequency?: string;

  @ApiPropertyOptional({ description: 'Duration of treatment' })
  @IsOptional()
  @IsString()
  duration?: string;

  @ApiPropertyOptional({ description: 'Usage instructions' })
  @IsOptional()
  @IsString()
  instructions?: string;

  @ApiPropertyOptional({ description: 'Additional notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateMedicalRecordDto {
  @ApiProperty({ description: 'Patiennt employee code' })
  @IsString()
  patientEmployeeCode: string;

  @ApiProperty({ description: 'Doctor user ID' })
  @IsString()
  doctorId: string;

  @ApiPropertyOptional({
    description: 'Visit date - defaults to current date if not provided',
  })
  @IsOptional()
  @IsString()
  visitDate?: string;

  @ApiPropertyOptional({ description: 'Patient symptoms' })
  @IsOptional()
  @IsString()
  symptoms?: string;

  @ApiPropertyOptional({ description: 'Medical diagnosis' })
  @IsOptional()
  @IsString()
  diagnosis?: string;

  @ApiPropertyOptional({ description: 'Additional notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Work accident case (TNLĐ)' })
  @IsOptional()
  @IsBoolean()
  isWorkAccident?: boolean;

  @ApiPropertyOptional({ description: 'Company ID (for SUPERADMIN to scope to a specific company)' })
  @IsOptional()
  @IsString()
  companyId?: string;

  @ApiPropertyOptional({
    description: 'List of prescriptions',
    type: [CreatePrescriptionDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePrescriptionDto)
  prescriptions?: CreatePrescriptionDto[];
}

export class UpdateMedicalRecordDto {
  @ApiPropertyOptional({ description: 'Visit date' })
  @IsOptional()
  @IsString()
  visitDate?: string;

  @ApiPropertyOptional({ description: 'Patient symptoms' })
  @IsOptional()
  @IsString()
  symptoms?: string;

  @ApiPropertyOptional({ description: 'Medical diagnosis' })
  @IsOptional()
  @IsString()
  diagnosis?: string;

  @ApiPropertyOptional({ description: 'Additional notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Work accident case (TNLĐ)' })
  @IsOptional()
  @IsBoolean()
  isWorkAccident?: boolean;

  @ApiPropertyOptional({
    description: 'List of prescriptions to update/add',
    type: [CreatePrescriptionDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePrescriptionDto)
  prescriptions?: CreatePrescriptionDto[];
}

export class CreateMedicineDto {
  @ApiProperty({ description: 'Medicine name' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ enum: MedicalItemTypeDto, description: 'Medicine type' })
  @IsOptional()
  @IsEnum(MedicalItemTypeDto)
  type?: MedicalItemTypeDto;

  @ApiPropertyOptional({ description: 'Category ID (nhóm thuốc I–XVII)' })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Route of administration (UỐNG, NHỎ MẮT, BÔI...)' })
  @IsOptional()
  @IsString()
  route?: string;

  @ApiPropertyOptional({ description: 'Medicine strength e.g. 500mg' })
  @IsOptional()
  @IsString()
  strength?: string;

  @ApiPropertyOptional({ description: 'Manufacturer' })
  @IsOptional()
  @IsString()
  manufacturer?: string;

  @ApiPropertyOptional({ description: 'Dosage instruction' })
  @IsOptional()
  @IsString()
  dosage?: string;

  @ApiPropertyOptional({ description: 'Usage frequency' })
  @IsOptional()
  @IsString()
  frequency?: string;

  @ApiPropertyOptional({ description: 'Usage instructions' })
  @IsOptional()
  @IsString()
  instructions?: string;

  @ApiPropertyOptional({ description: 'Units e.g. viên, chai, lọ' })
  @IsOptional()
  @IsString()
  units?: string;
}

export class UpdateMedicineDto {
  @ApiPropertyOptional({ description: 'Medicine name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ enum: MedicalItemTypeDto, description: 'Medicine type' })
  @IsOptional()
  @IsEnum(MedicalItemTypeDto)
  type?: MedicalItemTypeDto;

  @ApiPropertyOptional({ description: 'Category ID' })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Route of administration' })
  @IsOptional()
  @IsString()
  route?: string;

  @ApiPropertyOptional({ description: 'Medicine strength' })
  @IsOptional()
  @IsString()
  strength?: string;

  @ApiPropertyOptional({ description: 'Manufacturer' })
  @IsOptional()
  @IsString()
  manufacturer?: string;

  @ApiPropertyOptional({ description: 'Dosage instruction' })
  @IsOptional()
  @IsString()
  dosage?: string;

  @ApiPropertyOptional({ description: 'Usage frequency' })
  @IsOptional()
  @IsString()
  frequency?: string;

  @ApiPropertyOptional({ description: 'Usage instructions' })
  @IsOptional()
  @IsString()
  instructions?: string;

  @ApiPropertyOptional({ description: 'Units e.g. viên, chai, lọ' })
  @IsOptional()
  @IsString()
  units?: string;

  @ApiPropertyOptional({ description: 'Active status' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class GetMedicalRecordsDto {
  @ApiPropertyOptional({ description: 'Filter by doctor ID' })
  @IsOptional()
  @IsString()
  doctorId?: string;

  @ApiPropertyOptional({ description: 'Filter by patient employee code' })
  @IsOptional()
  @IsString()
  patientEmployeeCode?: string;

  @ApiPropertyOptional({ description: 'Start date (ISO string)' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date (ISO string)' })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page', default: 20 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number;
}
