import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Query,
  ParseIntPipe,
  UsePipes,
  ValidationPipe,
  Patch,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Public } from '../common/decorators/public.decorator';
import { HealthcareService } from './healthcare.service';
import {
  CreateMedicalRecordDto,
  UpdateMedicalRecordDto,
  CreateMedicineDto,
  UpdateMedicineDto,
  GetMedicalRecordsDto,
} from './dto/healthcare.dto';

@ApiTags('healthcare')
@Controller('healthcare')
@UseGuards(JwtAuthGuard, RolesGuard)
@RequirePermissions('healthcare:view')
@ApiBearerAuth('JWT-auth')
export class HealthcareController {
  constructor(private readonly healthcareService: HealthcareService) {}

  @Get('dashboard')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Get healthcare dashboard statistics' })
  @ApiResponse({
    status: 200,
    description: 'Dashboard statistics retrieved successfully',
  })
  async getDashboard() {
    return this.healthcareService.getDashboardStats();
  }

  @Get('recent-activities')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Get recent healthcare activities' })
  @ApiResponse({
    status: 200,
    description: 'Recent activities retrieved successfully',
  })
  async getRecentActivities(
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.healthcareService.getRecentActivities(limit);
  }

  // Medicine Management Endpoints
  @Get('medicines')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Get all medicines' })
  async getMedicines(@Query('search') search?: string) {
    return this.healthcareService.getMedicines(search);
  }

  @Post('medicines')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @RequirePermissions('healthcare:create')
  @ApiOperation({ summary: 'Create new medicine' })
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  )
  async createMedicine(@Body() data: CreateMedicineDto) {
    return this.healthcareService.createMedicine(data);
  }

  @Patch('medicines/:id')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @RequirePermissions('healthcare:update')
  @ApiOperation({ summary: 'Update medicine' })
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  )
  async updateMedicine(
    @Param('id') id: string,
    @Body() data: UpdateMedicineDto,
  ) {
    return this.healthcareService.updateMedicine(id, data);
  }

  @Delete('medicines/:id')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Delete medicine' })
  async deleteMedicine(@Param('id') id: string) {
    return this.healthcareService.deleteMedicine(id);
  }

  // Patient History Lookup — public, no auth required (lookup by employee code)
  @Public()
  @Get('patient-history/:employeeCode')
  @ApiOperation({ summary: 'Get patient medical history by employee code' })
  async getPatientHistory(
    @Param('employeeCode') employeeCode: string,
  ) {
    return this.healthcareService.getPatientHistory(employeeCode);
  }

  // Medical Record Management
  @Get('medical-records')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'List medical records with filters and pagination' })
  async getMedicalRecords(@Query() query: GetMedicalRecordsDto) {
    return this.healthcareService.getMedicalRecords(query);
  }

  @Post('medical-records')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @RequirePermissions('healthcare:create')
  @ApiOperation({ summary: 'Create new medical record with prescriptions' })
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  )
  async createMedicalRecord(@Body() data: CreateMedicalRecordDto) {
    return this.healthcareService.createMedicalRecordByEmployeeCode(data);
  }

  @Patch('medical-records/:id')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @RequirePermissions('healthcare:update')
  @ApiOperation({ summary: 'Update medical record' })
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  )
  async updateMedicalRecord(
    @Param('id') id: string,
    @Body() data: UpdateMedicalRecordDto,
  ) {
    return this.healthcareService.updateMedicalRecord(id, data);
  }

  @Delete('medical-records/:id')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @RequirePermissions('healthcare:delete')
  @ApiOperation({ summary: 'Delete medical record and reverse inventory' })
  async deleteMedicalRecord(@Param('id') id: string) {
    return this.healthcareService.deleteMedicalRecord(id);
  }

  @Post('prescriptions/:id/dispense')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @RequirePermissions('healthcare:update')
  @ApiOperation({ summary: 'Dispense medicine prescription' })
  async dispenseMedicine(
    @Param('id') prescriptionId: string,
    @Body() data: { dispenserId: string },
  ) {
    return this.healthcareService.dispenseMedicine(
      prescriptionId,
      data.dispenserId,
    );
  }

  // Medicine Statistics & Analytics
  @Get('statistics/medicine-usage')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Get medicine usage statistics' })
  @ApiResponse({
    status: 200,
    description: 'Medicine usage statistics retrieved successfully',
  })
  async getMedicineUsageStatistics(
    @Query('period') period: 'day' | 'week' | 'month' | 'year' = 'month',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.healthcareService.getMedicineUsageStatistics(
      period,
      startDate,
      endDate,
    );
  }

  @Get('statistics/prescription-trends')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Get prescription trends by time period' })
  @ApiResponse({
    status: 200,
    description: 'Prescription trends retrieved successfully',
  })
  async getPrescriptionTrends(
    @Query('period') period: 'day' | 'week' | 'month' | 'year' = 'month',
    @Query('limit', new ParseIntPipe({ optional: true })) limit: number = 12,
  ) {
    return this.healthcareService.getPrescriptionTrends(period, limit);
  }

  @Get('statistics/detailed')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({
    summary: 'Get detailed healthcare statistics (dispensing frequency, TNLĐ)',
  })
  @ApiResponse({
    status: 200,
    description: 'Detailed statistics retrieved successfully',
  })
  async getDetailedStatistics(
    @Query('period') period: 'day' | 'week' | 'month' | 'year' = 'month',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.healthcareService.getDetailedStatistics(
      period,
      startDate,
      endDate,
    );
  }

  @Get('statistics/top-medicines')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Get top prescribed medicines' })
  @ApiResponse({
    status: 200,
    description: 'Top medicines retrieved successfully',
  })
  async getTopPrescribedMedicines(
    @Query('period') period: 'day' | 'week' | 'month' | 'year' = 'month',
    @Query('limit', new ParseIntPipe({ optional: true })) limit: number = 10,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.healthcareService.getTopPrescribedMedicines(
      period,
      limit,
      startDate,
      endDate,
    );
  }

  @Get('statistics/patient-visits')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Get patient visit list with dispensed medicines and total value' })
  async getPatientVisitStats(
    @Query('period') period: 'day' | 'week' | 'month' | 'year' = 'month',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.healthcareService.getPatientVisitStats(period, startDate, endDate);
  }
}
