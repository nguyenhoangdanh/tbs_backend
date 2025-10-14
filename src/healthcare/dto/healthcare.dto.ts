import { IsString, IsNumber, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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

  @ApiPropertyOptional({ description: 'List of prescriptions', type: [CreatePrescriptionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePrescriptionDto)
  prescriptions?: CreatePrescriptionDto[];
}

export class UpdateMedicalRecordDto {
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

  @ApiPropertyOptional({ description: 'List of prescriptions to update/add', type: [CreatePrescriptionDto] })
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

  @ApiPropertyOptional({ description: 'Dosage instruction' })
  @IsOptional()
  @IsString()
  dosage?: string;

  @ApiPropertyOptional({ description: 'Medicine strength' })
  @IsOptional()
  @IsString()
  strength?: string;

  @ApiPropertyOptional({ description: 'Usage frequency' })
  @IsOptional()
  @IsString()
  frequency?: string;

  @ApiPropertyOptional({ description: 'Usage instructions' })
  @IsOptional()
  @IsString()
  instructions?: string;

  @ApiPropertyOptional({ description: 'Units of the medicine, e.g., "tablet", "bottle"' })
  @IsOptional()
  @IsString()
  units?: string;
}

export class UpdateMedicineDto {
  @ApiPropertyOptional({ description: 'Medicine name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Dosage instruction' })
  @IsOptional()
  @IsString()
  dosage?: string;

  @ApiPropertyOptional({ description: 'Medicine strength' })
  @IsOptional()
  @IsString()
  strength?: string;

  @ApiPropertyOptional({ description: 'Usage frequency' })
  @IsOptional()
  @IsString()
  frequency?: string;

  @ApiPropertyOptional({ description: 'Usage instructions' })
  @IsOptional()
  @IsString()
  instructions?: string;

  @ApiPropertyOptional({ description: 'Units of the medicine, e.g., "tablet", "bottle"' })
  @IsOptional()
  @IsString()
  units?: string;
}