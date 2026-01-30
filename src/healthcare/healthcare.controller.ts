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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { HealthcareService } from './healthcare.service';
import { 
  CreateMedicalRecordDto, 
  UpdateMedicalRecordDto,
  CreateMedicineDto,
  UpdateMedicineDto
} from './dto/healthcare.dto';
import { Public } from 'src/common/decorators/public.decorator';

@ApiTags('healthcare')
@Controller('healthcare')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class HealthcareController {
  constructor(private readonly healthcareService: HealthcareService) {}

  @Get('dashboard')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Get healthcare dashboard statistics' })
  @ApiResponse({ status: 200, description: 'Dashboard statistics retrieved successfully' })
  async getDashboard() {
    return this.healthcareService.getDashboardStats();
  }

  @Get('recent-activities')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Get recent healthcare activities' })
  @ApiResponse({ status: 200, description: 'Recent activities retrieved successfully' })
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
  @ApiOperation({ summary: 'Create new medicine' })
  @UsePipes(new ValidationPipe({ 
    whitelist: true, 
    forbidNonWhitelisted: false,
    transform: true 
  }))
  async createMedicine(@Body() data: CreateMedicineDto) {
    return this.healthcareService.createMedicine(data);
  }

  @Patch('medicines/:id')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Update medicine' })
  @UsePipes(new ValidationPipe({ 
    whitelist: true, 
    forbidNonWhitelisted: false,
    transform: true 
  }))
  async updateMedicine(
    @Param('id') id: string,
    @Body() data: UpdateMedicineDto
  ) {
    return this.healthcareService.updateMedicine(id, data);
  }

  @Delete('medicines/:id')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Delete medicine' })
  async deleteMedicine(@Param('id') id: string) {
    return this.healthcareService.deleteMedicine(id);
  }

  // Patient History Lookup (Available to all users)
  @Get('patient-history/:employeeCode')
  @Public()
  @ApiOperation({ summary: 'Get patient medical history by employee code' })
  async getPatientHistory(@Param('employeeCode') employeeCode: string) {
    return this.healthcareService.getPatientHistory(employeeCode);
  }

  // Medical Record Management
  @Post('medical-records')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Create new medical record with prescriptions' })
  @UsePipes(new ValidationPipe({ 
    whitelist: true, 
    forbidNonWhitelisted: false,
    transform: true 
  }))
  async createMedicalRecord(@Body() data: CreateMedicalRecordDto) {
    return this.healthcareService.createMedicalRecordByEmployeeCode(data);
  }

  @Patch('medical-records/:id')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Update medical record' })
  @UsePipes(new ValidationPipe({ 
    whitelist: true, 
    forbidNonWhitelisted: false,
    transform: true 
  }))
  async updateMedicalRecord(
    @Param('id') id: string,
    @Body() data: UpdateMedicalRecordDto
  ) {
    return this.healthcareService.updateMedicalRecord(id, data);
  }

  @Post('prescriptions/:id/dispense')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Dispense medicine prescription' })
  async dispenseMedicine(
    @Param('id') prescriptionId: string,
    @Body() data: { dispenserId: string }
  ) {
    return this.healthcareService.dispenseMedicine(prescriptionId, data.dispenserId);
  }

  // Medicine Statistics & Analytics
  @Get('statistics/medicine-usage')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Get medicine usage statistics' })
  @ApiResponse({ status: 200, description: 'Medicine usage statistics retrieved successfully' })
  async getMedicineUsageStatistics(
    @Query('period') period: 'day' | 'week' | 'month' = 'month',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.healthcareService.getMedicineUsageStatistics(period, startDate, endDate);
  }

  @Get('statistics/prescription-trends')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Get prescription trends by time period' })
  @ApiResponse({ status: 200, description: 'Prescription trends retrieved successfully' })
  async getPrescriptionTrends(
    @Query('period') period: 'day' | 'week' | 'month' = 'month',
    @Query('limit', new ParseIntPipe({ optional: true })) limit: number = 12,
  ) {
    return this.healthcareService.getPrescriptionTrends(period, limit);
  }

  @Get('statistics/top-medicines')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Get top prescribed medicines' })
  @ApiResponse({ status: 200, description: 'Top medicines retrieved successfully' })
  async getTopPrescribedMedicines(
    @Query('period') period: 'day' | 'week' | 'month' = 'month',
    @Query('limit', new ParseIntPipe({ optional: true })) limit: number = 10,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.healthcareService.getTopPrescribedMedicines(period, limit, startDate, endDate);
  }
}