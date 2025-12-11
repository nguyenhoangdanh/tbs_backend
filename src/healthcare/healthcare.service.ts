import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { group } from 'node:console';

/*
 * HEALTHCARE TERMINOLOGY CLARIFICATION:
 * - Medical Record = Đơn thuốc (1 lần khám bệnh của bệnh nhân)
 * - Medical Prescription = Loại thuốc cụ thể (1 loại thuốc trong 1 đơn thuốc)
 * 
 * VD: 1 đơn thuốc (medical record) có thể có nhiều loại thuốc (prescriptions)
 * Bệnh nhân A khám 1 lần → 1 đơn thuốc (medical record)
 * Được kê 3 loại thuốc → 3 medicine prescriptions
 * 
 * Dashboard Stats:
 * - totalMedicalRecords = Tổng số đơn thuốc (số lần khám)
 * - totalPrescriptions = Tổng số loại thuốc được kê (có thể > số đơn thuốc)
 */

@Injectable()
export class HealthcareService {
  constructor(private prisma: PrismaService) {}

  // Dashboard statistics for healthcare
  async getDashboardStats() {
    const [
      uniquePatients,
      totalMedicalRecords,
      totalMedicines,
      todayRecords,
      totalPrescriptions,
      dispensedPrescriptions
    ] = await Promise.all([
      // Unique patients who have medical records
      this.prisma.medicalRecord.findMany({
        select: { patientId: true },
        distinct: ['patientId']
      }).then(records => records.length),

      // Total medical records (đây chính là "tổng số đơn thuốc")
      this.prisma.medicalRecord.count(),

      // Total active medicines
      this.prisma.medicine.count({
        where: { isActive: true }
      }),

      // Today's medical records (đơn thuốc hôm nay)
      this.prisma.medicalRecord.count({
        where: {
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
            lt: new Date(new Date().setHours(23, 59, 59, 999))
          }
        }
      }),

      // Total medicine prescriptions (tổng số loại thuốc được kê)
      this.prisma.medicalPrescription.count(),

      // Dispensed medicine prescriptions (số loại thuốc đã cấp)
      this.prisma.medicalPrescription.count({
        where: { isDispensed: true }
      })
    ]);

    const pendingPrescriptions = totalPrescriptions - dispensedPrescriptions;

    return {
      uniquePatients,
      totalMedicalRecords, // Tổng số đơn thuốc (số lần khám)
      totalMedicines,
      todayRecords,
      totalPrescriptions, // Tổng số loại thuốc được kê
      dispensedPrescriptions,
      pendingPrescriptions
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
    dosage?: string;
    strength?: string; 
    frequency?: string; 
    instructions?: string; 
    units?: string;
  }) {
    return this.prisma.medicine.create({
      data
    });
  }

  async updateMedicine(id: string, data: { 
    name?: string; 
    dosage?: string;
    strength?: string; 
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
      office: true,
      // Thông tin Group và các quan hệ lên trên
      group: {
        include: {
          team: {
            include: {
              department: {
                include: {
                  office: true  // Office chứa department này
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
          department: user.group?.team?.department?.name || null,
          office: user.group?.team?.department?.office.name || null,
        } : null,
      },
      medicalHistory
    };
  }

  async createMedicalRecord(data: {
    patientId: string;
    doctorId: string;
    visitDate?: string;
    symptoms?: string;
    diagnosis?: string;
    notes?: string;
    prescriptions?: Array<{
      medicineId: string;
      quantity: number;
      dosage?: string;
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
        visitDate: data.visitDate ? new Date(data.visitDate) : new Date(),
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
    visitDate?: string;
    symptoms?: string;
    diagnosis?: string;
    notes?: string;
    prescriptions?: Array<{
      medicineId: string;
      quantity: number;
      dosage?: string;
      frequency?: string;
      duration?: string;
      instructions?: string;
      notes?: string;
    }>;
  }) {
    const { prescriptions, ...recordData } = data;

    // Use transaction to ensure data consistency
    return this.prisma.$transaction(async (prisma) => {
      // Prepare update data with visitDate handling
      const updateData = {
        ...recordData,
        ...(data.visitDate && { visitDate: new Date(data.visitDate) })
      };

      // Update medical record basic info
      const updatedRecord = await prisma.medicalRecord.update({
        where: { id },
        data: updateData
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
          frequency: prescription.frequency || null,
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
    visitDate?: string;
    symptoms?: string;
    diagnosis?: string;
    notes?: string;
    prescriptions?: Array<{
      medicineId: string;
      quantity: number;
      dosage?: string;
      frequency?: string;
      strength?: string;
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
      frequency: prescription.frequency || null,
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
        visitDate: data.visitDate ? new Date(data.visitDate) : new Date(),
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
    const end = endDate ? new Date(endDate) : new Date();
    // Set end date to end of day to include all data from that day
    if (endDate) {
      end.setHours(23, 59, 59, 999);
    }
    
    const start = startDate ? new Date(startDate) : this.getDefaultStartDate(period, end);
    // Set start date to beginning of day
    if (startDate) {
      start.setHours(0, 0, 0, 0);
    }

    // Get prescriptions and medical records data
    const [prescriptions, medicalRecords] = await Promise.all([
      this.prisma.medicalPrescription.findMany({
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
              strength: true,
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
      }),
      this.prisma.medicalRecord.findMany({
        where: {
          visitDate: {
            gte: start,
            lte: end
          }
        },
        include: {
          prescriptions: true
        }
      })
    ]);

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

    // Generate weekly/daily trends for chart
    const trends = await this.generateTrendsData(medicalRecords, prescriptions, period, start, end);

    // Get accurate medicine distribution for the entire period
    const medicineDistribution = await this.getTopPrescribedMedicines(period, 10, startDate, endDate);
    
    // Get accurate total counts for the entire period  
    const totalStats = await Promise.all([
      this.prisma.medicalPrescription.groupBy({
        by: ['medicineId'],
        where: {
          createdAt: {
            gte: start,
            lte: end
          }
        }
      }),
      this.prisma.medicalPrescription.count({
        where: {
          createdAt: {
            gte: start,
            lte: end
          }
        }
      })
    ]);

    return {
      period,
      dateRange: { start, end },
      totalMedicines: totalStats[0].length, // Accurate count of unique medicines
      totalPrescriptions: totalStats[1], // Accurate count of total prescriptions
      medicineStatistics: Object.values(medicineStats).sort((a: any, b: any) => 
        b.totalQuantity - a.totalQuantity
      ),
      // Add trends data for charts
      weeklyTrends: trends,
      medicineDistribution: medicineDistribution.topMedicines // Use accurate data from getTopPrescribedMedicines
    };
  }

  // Helper method to generate trends data for charts
  private async generateTrendsData(medicalRecords: any[], prescriptions: any[], period: 'day' | 'week' | 'month', start: Date, end: Date) {
    const trends = [];
    
    // For day filter with custom date range, calculate actual days between start and end
    let limit: number;
    if (period === 'day') {
      const diffTime = end.getTime() - start.getTime();
      const diffDays = Math.ceil(diffTime / (24 * 60 * 60 * 1000));
      limit = Math.min(diffDays + 1, 31); // Max 31 days, +1 to include both start and end dates
    } else {
      limit = period === 'week' ? 7 : 12;
    }
    
    for (let i = 0; i < limit; i++) {
      let periodStart: Date, periodEnd: Date, label: string;
      
      switch (period) {
        case 'day': {
          // For day filter: show days from start to end date
          periodStart = new Date(start.getTime() + (i * 24 * 60 * 60 * 1000));
          periodStart.setHours(0, 0, 0, 0);
          periodEnd = new Date(periodStart);
          periodEnd.setHours(23, 59, 59, 999);
          
          // Skip if this date is beyond end date
          if (periodStart > end) break;
          
          // Format: 10/9, 12/9, etc.
          label = `${periodStart.getDate()}/${periodStart.getMonth() + 1}`;
          break;
        }
          
        case 'week': {
          // For week filter: show individual days from end date backwards (last 7 days from endDate)
          periodStart = new Date(end.getTime() - (i * 24 * 60 * 60 * 1000));
          periodStart.setHours(0, 0, 0, 0);
          periodEnd = new Date(periodStart);
          periodEnd.setHours(23, 59, 59, 999);
          
          // Format: 23/9, 24/9, 25/9, etc. (same as day format)
          label = `${periodStart.getDate()}/${periodStart.getMonth() + 1}`;
          break;
        }
          
        case 'month': {
          const reverseIndex = limit - 1 - i; // Reverse index for month counting
          const monthDate = new Date(end.getFullYear(), end.getMonth() - reverseIndex, 1);
          periodStart = monthDate;
          periodEnd = new Date(end.getFullYear(), end.getMonth() - reverseIndex + 1, 0);
          periodEnd.setHours(23, 59, 59, 999);
          label = `T${monthDate.getMonth() + 1}`;
          break;
        }
          
        default:
          continue;
      }

            // For day filter, we need to fetch data for each day from database
      // For week/month, use filtered data as before
      let periodExaminations = 0;
      let medicinesDispensed = 0;

      if (period === 'day' || period === 'week') {
        // Fetch actual data for this specific day from database (both day and week use daily data)
        const [dayRecords, dayPrescriptions] = await Promise.all([
          this.prisma.medicalRecord.count({
            where: {
              visitDate: {
                gte: periodStart,
                lte: periodEnd
              }
            }
          }),
          this.prisma.medicalPrescription.aggregate({
            where: {
              createdAt: {
                gte: periodStart,
                lte: periodEnd
              }
            },
            _sum: {
              quantity: true
            }
          })
        ]);
        
        periodExaminations = dayRecords;
        medicinesDispensed = dayPrescriptions._sum.quantity || 0;
      } else {
        // For month: use filtered data as before
        const filteredRecords = medicalRecords.filter(record => {
          const visitDate = new Date(record.visitDate);
          return visitDate >= periodStart && visitDate <= periodEnd;
        });

        const filteredPrescriptions = prescriptions.filter(p => {
          const createdAt = new Date(p.createdAt);
          return createdAt >= periodStart && createdAt <= periodEnd;
        });

        periodExaminations = filteredRecords.length;
        medicinesDispensed = filteredPrescriptions.reduce((sum, p) => sum + p.quantity, 0);
      }

      trends.push({
        day: label,
        period: label,
        examinations: periodExaminations,
        medicines: medicinesDispensed,
        date: periodStart.toISOString()
      });
    }

    return trends;
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
    const end = endDate ? new Date(endDate) : new Date();
    // Set end date to end of day to include all data from that day
    if (endDate) {
      end.setHours(23, 59, 59, 999);
    }
    
    const start = startDate ? new Date(startDate) : this.getDefaultStartDate(period, end);
    // Set start date to beginning of day
    if (startDate) {
      start.setHours(0, 0, 0, 0);
    }

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

  // Helper methods for date calculations - from working old code
  private getDefaultStartDate(period: 'day' | 'week' | 'month', endDate?: Date | number): Date {
    const now = endDate ? (endDate instanceof Date ? endDate : new Date()) : new Date();
    
    switch (period) {
      case 'day': {
        // Use endDate as today
        const today = new Date(now);
        today.setHours(0, 0, 0, 0);
        return today;
      }
      case 'week': {
        // Start of week based on endDate
        const startOfWeek = new Date(now);
        const dayOfWeek = startOfWeek.getDay();
        const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        startOfWeek.setDate(startOfWeek.getDate() - daysToMonday);
        startOfWeek.setHours(0, 0, 0, 0);
        return startOfWeek;
      }
      case 'month': {
        // Start of month based on endDate
        const startOfMonth = new Date(now);
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        return startOfMonth;
      }
      default:
        return new Date(now.getFullYear(), now.getMonth() - 1, 1);
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
          
          // Calculate week number correctly within the month
          const firstDayOfMonth = new Date(periodStart.getFullYear(), periodStart.getMonth(), 1);
          const firstDayWeekday = firstDayOfMonth.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
          
          // Find the date of the first Monday in the month
          let firstMondayDate;
          if (firstDayWeekday === 1) {
            firstMondayDate = 1; // Month starts on Monday
          } else if (firstDayWeekday === 0) {
            firstMondayDate = 2; // Month starts on Sunday, first Monday is 2nd
          } else {
            firstMondayDate = 8 - firstDayWeekday + 1; // Days until next Monday
          }
          
          // Calculate which week this Monday belongs to
          const mondayDate = periodStart.getDate();
          let weekNumber;
          if (mondayDate < firstMondayDate) {
            weekNumber = 1; // Before first Monday = week 1
          } else {
            weekNumber = Math.floor((mondayDate - firstMondayDate) / 7) + 2; // Weeks after first Monday
          }
          
          label = `Tuần ${weekNumber} T${periodStart.getMonth() + 1}`;
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