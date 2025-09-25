import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { group } from 'node:console';

@Injectable()
export class HealthcareService {
  constructor(private prisma: PrismaService) {}

  // Dashboard statistics for healthcare
  async getDashboardStats() {
    const [
      totalMedicalRecords,
      totalMedicines,
      todayRecords,
      totalPrescriptions,
      dispensedPrescriptions,
      pendingPrescriptions,
      uniquePatients,
    ] = await Promise.all([
      // Total medical records
      this.prisma.medicalRecord.count(),
      
      // Total medicines
      this.prisma.medicine.count({ where: { isActive: true } }),
      
      // Today's medical records
      this.prisma.medicalRecord.count({
        where: {
          visitDate: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
            lt: new Date(new Date().setHours(23, 59, 59, 999))
          }
        }
      }),

      // Total prescriptions
      this.prisma.medicalPrescription.count(),

      // Dispensed prescriptions
      this.prisma.medicalPrescription.count({
        where: { isDispensed: true }
      }),

      // Pending prescriptions
      this.prisma.medicalPrescription.count({
        where: { isDispensed: false }
      }),

      // Unique patients count
      this.prisma.medicalRecord.groupBy({
        by: ['patientId'],
        _count: { patientId: true }
      }).then(result => result.length)
    ]);

    return {
      uniquePatients,
      totalMedicalRecords,
      totalMedicines,
      todayRecords,
      totalPrescriptions,
      dispensedPrescriptions,
      pendingPrescriptions,
    };
  }

  // Get recent activities
  async getRecentActivities(limit: number = 20) {
    const recentRecords = await this.prisma.medicalRecord.findMany({
      take: limit,
      orderBy: {
        visitDate: 'desc'
      },
      include: {
        patient: {
          select: {
            firstName: true,
            lastName: true,
            employeeCode: true,
            phone: true,
            email: true
          }
        },
        doctor: {
          select: {
            firstName: true,
            lastName: true,
            employeeCode: true
          }
        },
        // ✅ ADD THIS - Include prescriptions with medicine details
        prescriptions: {
          include: {
            medicine: {
              select: {
                id: true,
                name: true,
                dosage: true,
                frequency: true,
                instructions: true,
                units: true
              }
            },
            dispenser: {
              select: {
                firstName: true,
                lastName: true,
                employeeCode: true
              }
            }
          }
        }
      }
    });

    return {
      recentRecords
    };
  }

  // Medicine management
  async getMedicines(search?: string) {
    const where = search ? {
      OR: [
        { name: { contains: search, mode: 'insensitive' as const } }
      ],
      isActive: true
    } : { isActive: true };

    return this.prisma.medicine.findMany({
      where,
      orderBy: { name: 'asc' }
    });
  }

  async createMedicine(data: { 
    name: string; 
    dosage: string; 
    frequency: string; 
    instructions: string; 
    units: string;
  }) {
    return this.prisma.medicine.create({
      data
    });
  }

  async updateMedicine(id: string, data: { 
    name?: string; 
    dosage?: string; 
    frequency?: string; 
    instructions?: string; 
    units?: string;
  }) {
    return this.prisma.medicine.update({
      where: { id },
      data
    });
  }

  async deleteMedicine(id: string) {
    return this.prisma.medicine.update({
      where: { id },
      data: { isActive: false }
    });
  }

  // Medical records management
  async getPatientHistory(employeeCode: string) {
    const user = await this.prisma.user.findUnique({
  where: { employeeCode },
  include: {
      // Thông tin JobPosition và các quan hệ của nó
      jobPosition: {
        include: {
          position: true,        // Thông tin chức vụ (Position)
          department: {
            include: {
              office: true        // Thông tin văn phòng (Office)
            }
          }
        }
      },
      // Thông tin Office trực tiếp
      office: {
        include: {
          factories: true        // Danh sách các nhà máy thuộc office này
        }
      },
      // Thông tin Group và các quan hệ lên trên
      group: {
        include: {
          team: {
            include: {
              line: {
                include: {
                  factory: true  // Factory chứa line này
                }
              }
            }
          },
          leader: true           // Thông tin leader của group
        }
      }
    }
  });


    if (!user) {
      throw new Error('Employee not found');
    }

    const medicalHistory = await this.prisma.medicalRecord.findMany({
      where: { patientId: user.id },
      include: {
        doctor: { select: { firstName: true, lastName: true, employeeCode: true } },
        prescriptions: {
          include: {
            medicine: true,
            dispenser: { select: { firstName: true, lastName: true } }
          }
        }
      },
      orderBy: { visitDate: 'desc' }
    });

    return {
      patient: {
        firstName: user.firstName,
        lastName: user.lastName,
        employeeCode: user.employeeCode,
        phone: user.phone,
        email: user.email,
        sex: user.sex,
        dateOfBirth: user.dateOfBirth,
        position: user.jobPosition.position.description,
        jobPositionName: user.jobPosition.jobName,
        department: user.jobPosition.department ? {
          name: user.jobPosition.department.name,
          description: user.jobPosition.department.description,
          officeName: user.jobPosition.department.office.name,
        } : null,
        group: user.group ? {
          name: user.group?.name || null,
          teamName: user.group?.team?.name || null,
          line: user.group?.team?.line?.name || null,
          factory: user.group?.team?.line?.factory.name || null,
        } : null,
      },
      medicalHistory
    };
  }

  async createMedicalRecord(data: {
    patientId: string;
    doctorId: string;
    symptoms?: string;
    diagnosis?: string;
    notes?: string;
    prescriptions?: Array<{
      medicineId: string;
      quantity: number;
      dosage: string;
      duration?: string;
      instructions?: string;
      notes?: string;
    }>;
  }) {
    const { prescriptions, ...recordData } = data;

    // Prepare prescriptions data with auto-dispensed status
    const prescriptionCreateData = prescriptions?.map(prescription => ({
      medicineId: prescription.medicineId,
      quantity: prescription.quantity,
      dosage: prescription.dosage,
      duration: prescription.duration || null,
      instructions: prescription.instructions || null,
      notes: prescription.notes || null,
      isDispensed: true, // Auto-dispensed when created
      dispensedAt: new Date(),
      dispensedBy: data.doctorId
    })) || [];

    return this.prisma.medicalRecord.create({
      data: {
        ...recordData,
        prescriptions: prescriptionCreateData.length > 0 ? {
          create: prescriptionCreateData
        } : undefined
      },
      include: {
        patient: { select: { firstName: true, lastName: true, employeeCode: true } },
        doctor: { select: { firstName: true, lastName: true, employeeCode: true } },
        prescriptions: {
          include: {
            medicine: true
          }
        }
      }
    });
  }

  async updateMedicalRecord(id: string, data: {
    symptoms?: string;
    diagnosis?: string;
    notes?: string;
    prescriptions?: Array<{
      medicineId: string;
      quantity: number;
      dosage: string;
      duration?: string;
      instructions?: string;
      notes?: string;
    }>;
  }) {
    const { prescriptions, ...recordData } = data;

    // Use transaction to ensure data consistency
    return this.prisma.$transaction(async (prisma) => {
      // Update medical record basic info
      const updatedRecord = await prisma.medicalRecord.update({
        where: { id },
        data: recordData
      });

      // If prescriptions are provided, replace existing ones
      if (prescriptions && prescriptions.length > 0) {
        // First, delete existing prescriptions for this medical record
        await prisma.medicalPrescription.deleteMany({
          where: { medicalRecordId: id }
        });

        // Get doctor ID from the medical record
        const medicalRecord = await prisma.medicalRecord.findUnique({
          where: { id },
          select: { doctorId: true }
        });

        // Create new prescriptions with auto-dispensed status
        const prescriptionCreateData = prescriptions.map(prescription => ({
          medicalRecordId: id,
          medicineId: prescription.medicineId,
          quantity: prescription.quantity,
          dosage: prescription.dosage,
          duration: prescription.duration || null,
          instructions: prescription.instructions || null,
          notes: prescription.notes || null,
          isDispensed: true, // Auto-dispensed when created/updated
          dispensedAt: new Date(),
          dispensedBy: medicalRecord?.doctorId || null
        }));

        await prisma.medicalPrescription.createMany({
          data: prescriptionCreateData
        });
      }

      // Return updated record with full relations
      return prisma.medicalRecord.findUnique({
        where: { id },
        include: {
          patient: { select: { firstName: true, lastName: true, employeeCode: true } },
          doctor: { select: { firstName: true, lastName: true, employeeCode: true } },
          prescriptions: {
            include: {
              medicine: true,
              dispenser: { select: { firstName: true, lastName: true } }
            }
          }
        }
      });
    });
  }

  async dispenseMedicine(prescriptionId: string, dispenserId: string) {
    return this.prisma.medicalPrescription.update({
      where: { id: prescriptionId },
      data: {
        isDispensed: true,
        dispensedAt: new Date(),
        dispensedBy: dispenserId
      },
      include: {
        medicine: true,
        medicalRecord: {
          include: {
            patient: { select: { firstName: true, lastName: true, employeeCode: true } }
          }
        }
      }
    });
  }

  async createMedicalRecordByEmployeeCode(data: {
    patientEmployeeCode: string;
    doctorId: string;
    symptoms?: string;
    diagnosis?: string;
    notes?: string;
    prescriptions?: Array<{
      medicineId: string;
      quantity: number;
      dosage: string;
      duration?: string;
      instructions?: string;
      notes?: string;
    }>;
  }) {
    // Find patient by employee code
    const patient = await this.prisma.user.findUnique({
      where: { employeeCode: data.patientEmployeeCode }
    });

    if (!patient) {
      throw new Error('Employee not found');
    }

    const { patientEmployeeCode, prescriptions, ...recordData } = data;

    // Prepare prescriptions data with auto-dispensed status
    const prescriptionCreateData = prescriptions?.map(prescription => ({
      medicineId: prescription.medicineId,
      quantity: prescription.quantity,
      dosage: prescription.dosage,
      duration: prescription.duration || null,
      instructions: prescription.instructions || null,
      notes: prescription.notes || null,
      isDispensed: true, // Auto-dispensed when created
      dispensedAt: new Date(),
      dispensedBy: data.doctorId
    })) || [];

    return this.prisma.medicalRecord.create({
      data: {
        ...recordData,
        patientId: patient.id,
        prescriptions: prescriptionCreateData.length > 0 ? {
          create: prescriptionCreateData
        } : undefined
      },
      include: {
        patient: { 
          select: { 
            firstName: true, 
            lastName: true, 
            employeeCode: true 
          } 
        },
        doctor: { 
          select: { 
            firstName: true, 
            lastName: true, 
            employeeCode: true 
          } 
        },
        prescriptions: {
          include: {
            medicine: true
          }
        }
      }
    });
  }

  // Statistics and Analytics Methods
  async getMedicineUsageStatistics(
    period: 'day' | 'week' | 'month' = 'month',
    startDate?: string,
    endDate?: string
  ) {
    const start = startDate ? new Date(startDate) : this.getDefaultStartDate(period);
    const end = endDate ? new Date(endDate) : new Date();

    const prescriptions = await this.prisma.medicalPrescription.findMany({
      where: {
        createdAt: {
          gte: start,
          lte: end
        }
      },
      include: {
        medicine: {
          select: {
            id: true,
            name: true,
            dosage: true,
            frequency: true,
            instructions: true,
            units: true
          }
        },
        medicalRecord: {
          select: {
            visitDate: true
          }
        }
      }
    });

    // Group by medicine and calculate totals
    const medicineStats = prescriptions.reduce((acc, prescription) => {
      const medicineId = prescription.medicineId;
      
      if (!acc[medicineId]) {
        acc[medicineId] = {
          medicine: prescription.medicine,
          totalQuantity: 0,
          totalPrescriptions: 0,
          isDispensed: 0,
          pending: 0
        };
      }

      acc[medicineId].totalQuantity += prescription.quantity;
      acc[medicineId].totalPrescriptions += 1;
      
      if (prescription.isDispensed) {
        acc[medicineId].isDispensed += 1;
      } else {
        acc[medicineId].pending += 1;
      }

      return acc;
    }, {} as any);

    return {
      period,
      dateRange: { start, end },
      totalMedicines: Object.keys(medicineStats).length,
      totalPrescriptions: prescriptions.length,
      medicineStatistics: Object.values(medicineStats).sort((a: any, b: any) => 
        b.totalQuantity - a.totalQuantity
      )
    };
  }

  async getPrescriptionTrends(period: 'day' | 'week' | 'month' = 'month', limit: number = 12) {
    const start = this.getDefaultStartDate(period, limit);
    const end = new Date();

    const prescriptions = await this.prisma.medicalPrescription.findMany({
      where: {
        createdAt: {
          gte: start,
          lte: end
        }
      },
      include: {
        medicalRecord: {
          select: {
            visitDate: true
          }
        }
      }
    });

    // Group by period
    const trends = this.groupByPeriod(prescriptions, period, limit);

    return {
      period,
      dateRange: { start, end },
      trends
    };
  }

  async getTopPrescribedMedicines(
    period: 'day' | 'week' | 'month' = 'month',
    limit: number = 10,
    startDate?: string,
    endDate?: string
  ) {
    const start = startDate ? new Date(startDate) : this.getDefaultStartDate(period);
    const end = endDate ? new Date(endDate) : new Date();

    const result = await this.prisma.medicalPrescription.groupBy({
      by: ['medicineId'],
      where: {
        createdAt: {
          gte: start,
          lte: end
        }
      },
      _count: {
        id: true
      },
      _sum: {
        quantity: true
      },
      orderBy: {
        _count: {
          id: 'desc'
        }
      },
      take: limit
    });

    // Get medicine details
    const medicineIds = result.map(r => r.medicineId);
    const medicines = await this.prisma.medicine.findMany({
      where: {
        id: {
          in: medicineIds
        }
      }
    });

    const medicineMap = medicines.reduce((acc, medicine) => {
      acc[medicine.id] = medicine;
      return acc;
    }, {} as any);

    const topMedicines = result.map(r => ({
      medicine: medicineMap[r.medicineId],
      totalPrescriptions: r._count.id,
      totalQuantity: r._sum.quantity || 0
    }));

    return {
      period,
      dateRange: { start, end },
      topMedicines
    };
  }

  // Helper methods for date calculations
  private getDefaultStartDate(period: 'day' | 'week' | 'month', limit?: number): Date {
    const now = new Date();
    const multiplier = limit || (period === 'day' ? 30 : period === 'week' ? 12 : 12);
    
    switch (period) {
      case 'day':
        return new Date(now.getTime() - (multiplier * 24 * 60 * 60 * 1000));
      case 'week':
        return new Date(now.getTime() - (multiplier * 7 * 24 * 60 * 60 * 1000));
      case 'month':
        return new Date(now.getFullYear(), now.getMonth() - multiplier, 1);
      default:
        return new Date(now.getFullYear(), now.getMonth() - 12, 1);
    }
  }

  private groupByPeriod(prescriptions: any[], period: 'day' | 'week' | 'month', limit: number) {
    const trends = [];
    const now = new Date();
    
    for (let i = limit - 1; i >= 0; i--) {
      let periodStart: Date, periodEnd: Date, label: string;
      
      switch (period) {
        case 'day': {
          periodStart = new Date(now.getTime() - (i * 24 * 60 * 60 * 1000));
          periodStart.setHours(0, 0, 0, 0);
          periodEnd = new Date(periodStart);
          periodEnd.setHours(23, 59, 59, 999);
          label = periodStart.toISOString().split('T')[0];
          break;
        }
          
        case 'week': {
          const weekStart = new Date(now.getTime() - (i * 7 * 24 * 60 * 60 * 1000));
          const dayOfWeek = weekStart.getDay();
          periodStart = new Date(weekStart.getTime() - (dayOfWeek * 24 * 60 * 60 * 1000));
          periodStart.setHours(0, 0, 0, 0);
          periodEnd = new Date(periodStart.getTime() + (6 * 24 * 60 * 60 * 1000));
          periodEnd.setHours(23, 59, 59, 999);
          label = `Week ${this.getWeekNumber(periodStart)}/${periodStart.getFullYear()}`;
          break;
        }
          
        case 'month': {
          periodStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
          periodEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
          periodEnd.setHours(23, 59, 59, 999);
          label = `${periodStart.toLocaleString('default', { month: 'short' })} ${periodStart.getFullYear()}`;
          break;
        }
          
        default:
          continue;
      }

      const periodPrescriptions = prescriptions.filter(p => {
        const createdAt = new Date(p.createdAt);
        return createdAt >= periodStart && createdAt <= periodEnd;
      });

      const totalQuantity = periodPrescriptions.reduce((sum, p) => sum + p.quantity, 0);
      const dispensed = periodPrescriptions.filter(p => p.isDispensed).length;

      trends.push({
        period: label,
        date: periodStart.toISOString(),
        totalPrescriptions: periodPrescriptions.length,
        totalQuantity,
        dispensedCount: dispensed,
        pendingCount: periodPrescriptions.length - dispensed
      });
    }

    return trends;
  }

  private getWeekNumber(date: Date): number {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  }
}