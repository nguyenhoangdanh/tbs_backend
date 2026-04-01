import { Injectable } from '@nestjs/common';
import { MedicalItemType, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { InventoryService } from './inventory.service';
import { InventoryTransactionTypeDto } from './dto/inventory.dto';

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
  constructor(
    private prisma: PrismaService,
    private inventoryService: InventoryService,
  ) {}

  /**
   * Parse a date-only string (YYYY-MM-DD from <input type="date">) as
   * Vietnam local noon (UTC+7 12:00 = UTC 05:00:00).
   *
   * Why noon, not midnight?
   * - `new Date("2026-02-15")` is parsed as UTC midnight → displays as
   *   07:00 Vietnam time, which is confusing.
   * - Noon UTC+7 = 05:00 UTC, safely within the correct calendar day in
   *   both UTC and UTC±12 timezones → getUTCMonth()/getUTCFullYear() always
   *   returns the correct month/year for inventory ledger calculations.
   */
  private parseVisitDate(dateStr: string): Date {
    return new Date(`${dateStr}T12:00:00+07:00`);
  }

  // For CREATE: if visitDate is today (VN), use actual current time; otherwise noon
  private parseVisitDateForCreate(dateStr: string): Date {
    const nowVN = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
    const todayVN = `${nowVN.getFullYear()}-${String(nowVN.getMonth() + 1).padStart(2, '0')}-${String(nowVN.getDate()).padStart(2, '0')}`;
    if (dateStr === todayVN) {
      return new Date(); // actual current timestamp
    }
    return this.parseVisitDate(dateStr); // past/future date → noon
  }

  // For UPDATE: keep existing time, only change the date portion
  private mergeVisitDateTime(newDateStr: string, existingDate: Date): Date {
    const noon = this.parseVisitDate(newDateStr);
    // Replace date portion but keep existing time
    noon.setUTCHours(existingDate.getUTCHours(), existingDate.getUTCMinutes(), existingDate.getUTCSeconds(), 0);
    return noon;
  }

  // Dashboard statistics for healthcare
  async getDashboardStats() {
    // "Today" boundaries in Vietnam time (UTC+7): midnight to 23:59:59
    const nowVN = new Date();
    const todayStartVN = new Date(nowVN);
    todayStartVN.setUTCHours(todayStartVN.getUTCHours() - 7); // shift to UTC+7 context
    // Simpler: just use UTC dates aligned with Vietnam day boundaries
    // VN midnight = UTC 17:00 (previous day). Use visitDate range: [today 00:00 VN, today 23:59 VN]
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0); // local server midnight (UTC if server is UTC)
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [
      uniquePatients,
      totalMedicalRecords,
      totalMedicines,
      todayRecords,
      totalPrescriptions,
      dispensedPrescriptions,
    ] = await Promise.all([
      // Unique patients who have medical records
      this.prisma.medicalRecord
        .findMany({
          select: { patientId: true },
          distinct: ['patientId'],
        })
        .then((records) => records.length),

      // Total medical records (đây chính là "tổng số đơn thuốc")
      this.prisma.medicalRecord.count(),

      // Total active medicines
      this.prisma.medicine.count({
        where: { isActive: true },
      }),

      // Today's medical records — filter by visitDate not createdAt
      // (users may create records with past visit dates; visitDate is the clinical date)
      this.prisma.medicalRecord.count({
        where: {
          visitDate: {
            gte: todayStart,
            lte: todayEnd,
          },
        },
      }),

      // Total medicine prescriptions (tổng số loại thuốc được kê)
      this.prisma.medicalPrescription.count(),

      // Dispensed medicine prescriptions (số loại thuốc đã cấp)
      this.prisma.medicalPrescription.count({
        where: { isDispensed: true },
      }),
    ]);

    const pendingPrescriptions = totalPrescriptions - dispensedPrescriptions;

    return {
      uniquePatients,
      totalMedicalRecords, // Tổng số đơn thuốc (số lần khám)
      totalMedicines,
      todayRecords,
      totalPrescriptions, // Tổng số loại thuốc được kê
      dispensedPrescriptions,
      pendingPrescriptions,
    };
  }

  // Get recent activities
  async getRecentActivities(limit: number = 20) {
    const recentRecords = await this.prisma.medicalRecord.findMany({
      take: limit,
      orderBy: {
        visitDate: 'desc',
      },
      include: {
        patient: {
          select: {
            firstName: true,
            lastName: true,
            employeeCode: true,
            phone: true,
            email: true,
          },
        },
        doctor: {
          select: {
            firstName: true,
            lastName: true,
            employeeCode: true,
          },
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
                units: true,
              },
            },
            dispenser: {
              select: {
                firstName: true,
                lastName: true,
                employeeCode: true,
              },
            },
          },
        },
      },
    });

    return {
      recentRecords,
    };
  }

  // Medicine management
  async getMedicines(search?: string) {
    const where = search
      ? {
          OR: [{ name: { contains: search, mode: 'insensitive' as const } }],
          isActive: true,
        }
      : { isActive: true };

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const medicines = await this.prisma.medicine.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        category: true,
        inventoryBalances: {
          where: { month: currentMonth, year: currentYear },
          select: { closingQuantity: true, closingUnitPrice: true },
          take: 1,
        },
      },
    });

    // Flatten: attach currentStock directly on each medicine
    return medicines.map((m) => {
      const { inventoryBalances, ...rest } = m;
      const stock = inventoryBalances[0];
      return {
        ...rest,
        currentStock: stock ? Number(stock.closingQuantity) : 0,
        unitPrice: stock ? Number(stock.closingUnitPrice) : 0,
      };
    });
  }

  async createMedicine(data: {
    name: string;
    type?: string;
    categoryId?: string;
    route?: string;
    dosage?: string;
    strength?: string;
    frequency?: string;
    instructions?: string;
    units?: string;
    manufacturer?: string;
  }) {
    const { type, categoryId, ...rest } = data;
    const createData: Prisma.MedicineUncheckedCreateInput = {
      ...rest,
      ...(type ? { type: type as MedicalItemType } : {}),
      ...(categoryId ? { categoryId } : {}),
    };
    return this.prisma.medicine.create({
      data: createData,
      include: { category: true },
    });
  }

  async updateMedicine(
    id: string,
    data: {
      name?: string;
      type?: string;
      categoryId?: string;
      route?: string;
      dosage?: string;
      strength?: string;
      frequency?: string;
      instructions?: string;
      units?: string;
      manufacturer?: string;
      isActive?: boolean;
    },
  ) {
    const { type, categoryId, ...rest } = data;
    const updateData: Prisma.MedicineUncheckedUpdateInput = {
      ...rest,
      ...(type !== undefined ? { type: type as MedicalItemType } : {}),
      ...(categoryId !== undefined ? { categoryId } : {}),
    };
    return this.prisma.medicine.update({
      where: { id },
      data: updateData,
      include: { category: true },
    });
  }

  async deleteMedicine(id: string) {
    return this.prisma.medicine.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // Medical records management
  async getPatientHistory(employeeCode: string) {
    const user = await this.prisma.user.findFirst({
      where: { employeeCode },
      include: {
        // Thông tin JobPosition và các quan hệ của nó
        jobPosition: {
          include: {
            position: true, // Thông tin chức vụ (Position)
            department: {
              include: {
                office: true, // Thông tin văn phòng (Office)
              },
            },
          },
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
                    office: true, // Office chứa department này
                  },
                },
              },
            },
            leader: true, // Thông tin leader của group
          },
        },
      },
    });

    if (!user) {
      throw new Error('Employee not found');
    }

    const medicalHistory = await this.prisma.medicalRecord.findMany({
      where: { patientId: user.id },
      include: {
        doctor: {
          select: { firstName: true, lastName: true, employeeCode: true },
        },
        prescriptions: {
          include: {
            medicine: true,
            dispenser: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { visitDate: 'desc' },
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
        department: user.jobPosition.department
          ? {
              name: user.jobPosition.department.name,
              description: user.jobPosition.department.description,
              officeName: user.jobPosition.department.office.name,
            }
          : null,
        group: user.group
          ? {
              name: user.group?.name || null,
              teamName: user.group?.team?.name || null,
              department: user.group?.team?.department?.name || null,
              office: user.group?.team?.department?.office.name || null,
            }
          : null,
      },
      medicalHistory,
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
    const prescriptionCreateData =
      prescriptions?.map((prescription) => ({
        medicineId: prescription.medicineId,
        quantity: prescription.quantity,
        dosage: prescription.dosage,
        duration: prescription.duration || null,
        instructions: prescription.instructions || null,
        notes: prescription.notes || null,
        isDispensed: true, // Auto-dispensed when created
        dispensedAt: new Date(),
        dispensedBy: data.doctorId,
      })) || [];

    return this.prisma.$transaction(async (prisma) => {
      // 1. Tạo medical record
      const medicalRecord = await prisma.medicalRecord.create({
        data: {
          ...recordData,
          visitDate: data.visitDate ? this.parseVisitDateForCreate(data.visitDate) : new Date(),
          prescriptions:
            prescriptionCreateData.length > 0
              ? {
                  create: prescriptionCreateData,
                }
              : undefined,
        },
        include: {
          patient: {
            select: { firstName: true, lastName: true, employeeCode: true },
          },
          doctor: {
            select: { firstName: true, lastName: true, employeeCode: true },
          },
          prescriptions: {
            include: {
              medicine: true,
            },
          },
        },
      });

      // 2. Tự động trừ tồn kho cho mỗi prescription
      if (prescriptions && prescriptions.length > 0) {
        for (const prescription of prescriptions) {
          try {
            // Lấy thông tin tồn kho hiện tại
            const currentStock = await this.inventoryService.getCurrentStock(
              prescription.medicineId,
            );

            if (currentStock.currentStock < prescription.quantity) {
              console.warn(
                `Warning: Medicine ${prescription.medicineId} has insufficient stock. Current: ${currentStock.currentStock}, Required: ${prescription.quantity}`,
              );
              // Có thể throw error hoặc tiếp tục tùy yêu cầu
              // throw new BadRequestException(`Thuốc không đủ tồn kho. Tồn: ${currentStock.currentStock}, Cần: ${prescription.quantity}`);
            }

            // Tạo transaction xuất kho - dùng visitDate của đơn khám
            await this.inventoryService.createInventoryTransaction({
              medicineId: prescription.medicineId,
              type: InventoryTransactionTypeDto.EXPORT,
              quantity: prescription.quantity,
              unitPrice: String(currentStock.unitPrice || '0'),
              transactionDate: medicalRecord.visitDate.toISOString(),
              referenceType: 'MEDICAL_RECORD',
              referenceId: medicalRecord.id,
              notes: `Xuất thuốc theo đơn - BS: ${data.doctorId}`,
              createdById: data.doctorId,
            });
          } catch (error) {
            console.error(
              `Error creating inventory transaction for medicine ${prescription.medicineId}:`,
              error,
            );
            // Không throw error để không rollback toàn bộ transaction
          }
        }
      }

      return medicalRecord;
    });
  }

  async updateMedicalRecord(
    id: string,
    data: {
      visitDate?: string;
      symptoms?: string;
      diagnosis?: string;
      notes?: string;
      isWorkAccident?: boolean;
      prescriptions?: Array<{
        medicineId: string;
        quantity: number;
        dosage?: string;
        frequency?: string;
        duration?: string;
        instructions?: string;
        notes?: string;
      }>;
    },
  ) {
    const { prescriptions, ...recordData } = data;

    return this.prisma.$transaction(async (prisma) => {
      // 1. Đọc đơn thuốc CŨ trước khi xóa — cần để biết phải hoàn trả tồn kho gì
      const oldPrescriptions = await prisma.medicalPrescription.findMany({
        where: { medicalRecordId: id },
        select: { medicineId: true, quantity: true, isDispensed: true },
      });

      // 2. Lấy thông tin BS từ medical record
      const medicalRecord = await prisma.medicalRecord.findUnique({
        where: { id },
        select: { doctorId: true, visitDate: true },
      });

      // 3. Cập nhật thông tin cơ bản của medical record — giữ nguyên giờ khám gốc
      const newVisitDate = data.visitDate && medicalRecord
        ? this.mergeVisitDateTime(data.visitDate, medicalRecord.visitDate)
        : undefined;

      await prisma.medicalRecord.update({
        where: { id },
        data: {
          ...recordData,
          ...(newVisitDate && { visitDate: newVisitDate }),
        },
      });

      // 4. Nếu có cập nhật đơn thuốc → xử lý tồn kho + prescription records
      if (prescriptions !== undefined) {
        // 4a. HOÀN TRẢ tồn kho cho từng thuốc đã được xuất kho trước đó
        //     (chỉ những prescription có isDispensed=true mới được xuất kho)
        for (const old of oldPrescriptions) {
          if (old.isDispensed) {
            try {
              await this.inventoryService.reverseExportTransaction(
                old.medicineId,
                id, // referenceId = medicalRecordId
              );
            } catch (err) {
              console.error(
                `[updateMedicalRecord] Lỗi hoàn trả tồn kho thuốc ${old.medicineId}:`,
                err,
              );
              // Throw để rollback toàn bộ: không cho phép tồn kho không khớp với đơn thuốc
              throw err;
            }
          }
        }

        // 4b. Xóa prescription records cũ
        await prisma.medicalPrescription.deleteMany({
          where: { medicalRecordId: id },
        });

        // 4c. Tạo prescription records mới
        await prisma.medicalPrescription.createMany({
          data: prescriptions.map((p) => ({
            medicalRecordId: id,
            medicineId: p.medicineId,
            quantity: p.quantity,
            dosage: p.dosage,
            duration: p.duration || null,
            instructions: p.instructions || null,
            frequency: p.frequency || null,
            notes: p.notes || null,
            isDispensed: true, // Auto-dispensed
            dispensedAt: new Date(),
            dispensedBy: medicalRecord?.doctorId || null,
          })),
        });

        // 4d. Tạo giao dịch XUẤT KHO mới cho đơn thuốc đã cập nhật
        for (const p of prescriptions) {
          try {
            const currentStock = await this.inventoryService.getCurrentStock(
              p.medicineId,
            );

            if (currentStock.currentStock < p.quantity) {
              console.warn(
                `[updateMedicalRecord] Cảnh báo: Thuốc ${p.medicineId} không đủ tồn kho. ` +
                  `Hiện tại: ${currentStock.currentStock}, Cần: ${p.quantity}`,
              );
            }

            await this.inventoryService.createInventoryTransaction({
              medicineId: p.medicineId,
              type: InventoryTransactionTypeDto.EXPORT,
              quantity: p.quantity,
              unitPrice: String(currentStock.unitPrice || '0'),
              transactionDate: (newVisitDate ?? medicalRecord?.visitDate ?? new Date()).toISOString(),
              referenceType: 'MEDICAL_RECORD',
              referenceId: id,
              notes: `Xuất thuốc theo đơn (cập nhật) - Đơn #${id.slice(-8)}`,
              createdById: medicalRecord?.doctorId || undefined,
            });
          } catch (err) {
            console.error(
              `[updateMedicalRecord] Lỗi tạo giao dịch xuất kho thuốc ${p.medicineId}:`,
              err,
            );
            throw err; // Rollback toàn bộ — không cho phép tạo đơn mà không trừ kho
          }
        }
      }

      // 5. Trả về medical record đã cập nhật kèm đầy đủ relations
      return prisma.medicalRecord.findUnique({
        where: { id },
        include: {
          patient: {
            select: { firstName: true, lastName: true, employeeCode: true },
          },
          doctor: {
            select: { firstName: true, lastName: true, employeeCode: true },
          },
          prescriptions: {
            include: {
              medicine: true,
              dispenser: { select: { firstName: true, lastName: true } },
            },
          },
        },
      });
    });
  }

  async dispenseMedicine(prescriptionId: string, dispenserId: string) {
    // 1. Đọc prescription để biết loại thuốc + số lượng — chỉ xử lý nếu chưa cấp
    const prescription = await this.prisma.medicalPrescription.findUnique({
      where: { id: prescriptionId },
      select: {
        id: true,
        medicineId: true,
        quantity: true,
        isDispensed: true,
        medicalRecordId: true,
      },
    });

    if (!prescription) {
      throw new Error(`Prescription ${prescriptionId} not found`);
    }

    if (prescription.isDispensed) {
      // Đã cấp rồi → chỉ cập nhật metadata, không trừ kho lần nữa
      return this.prisma.medicalPrescription.update({
        where: { id: prescriptionId },
        data: { dispensedAt: new Date(), dispensedBy: dispenserId },
        include: {
          medicine: true,
          medicalRecord: {
            include: {
              patient: {
                select: { firstName: true, lastName: true, employeeCode: true },
              },
            },
          },
        },
      });
    }

    // 2. Validate stock before dispensing
    const currentStock = await this.inventoryService.getCurrentStock(
      prescription.medicineId,
    );
    if (currentStock.currentStock < prescription.quantity) {
      throw new Error(
        `Tồn kho không đủ. Hiện tại: ${currentStock.currentStock}, Cần: ${prescription.quantity}`,
      );
    }

    // 3. Đánh dấu đã cấp + tạo giao dịch xuất kho (sequential, errors propagate)
    const updated = await this.prisma.medicalPrescription.update({
      where: { id: prescriptionId },
      data: {
        isDispensed: true,
        dispensedAt: new Date(),
        dispensedBy: dispenserId,
      },
      include: {
        medicine: true,
        medicalRecord: {
          include: {
            patient: {
              select: { firstName: true, lastName: true, employeeCode: true },
            },
          },
        },
      },
    });

    await this.inventoryService.createInventoryTransaction({
      medicineId: prescription.medicineId,
      type: InventoryTransactionTypeDto.EXPORT,
      quantity: prescription.quantity,
      unitPrice: String(currentStock.unitPrice || '0'),
      referenceType: 'MEDICAL_RECORD',
      referenceId: prescription.medicalRecordId,
      notes: `Xuất thuốc thủ công - Người cấp: ${dispenserId}`,
      createdById: dispenserId,
    });

    return updated;
  }

  async createMedicalRecordByEmployeeCode(data: {
    patientEmployeeCode: string;
    doctorId: string;
    visitDate?: string;
    symptoms?: string;
    diagnosis?: string;
    notes?: string;
    isWorkAccident?: boolean;
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
    const patient = await this.prisma.user.findFirst({
      where: { employeeCode: data.patientEmployeeCode },
    });

    if (!patient) {
      throw new Error('Employee not found');
    }

    const { patientEmployeeCode, prescriptions, ...recordData } = data;

    // Pre-validate stock before entering transaction
    if (prescriptions && prescriptions.length > 0) {
      const insufficientItems: string[] = [];
      for (const prescription of prescriptions) {
        const stock = await this.inventoryService.getCurrentStock(
          prescription.medicineId,
        );
        if (stock.currentStock < prescription.quantity) {
          insufficientItems.push(
            `${prescription.medicineId} (tồn: ${stock.currentStock}, cần: ${prescription.quantity})`,
          );
        }
      }
      if (insufficientItems.length > 0) {
        throw new Error(
          `Tồn kho không đủ cho thuốc: ${insufficientItems.join(', ')}`,
        );
      }
    }

    // Prepare prescriptions data with auto-dispensed status
    const prescriptionCreateData =
      prescriptions?.map((prescription) => ({
        medicineId: prescription.medicineId,
        quantity: prescription.quantity,
        dosage: prescription.dosage,
        duration: prescription.duration || null,
        frequency: prescription.frequency || null,
        instructions: prescription.instructions || null,
        notes: prescription.notes || null,
        isDispensed: true, // Auto-dispensed when created
        dispensedAt: new Date(),
        dispensedBy: data.doctorId,
      })) || [];

    return this.prisma.$transaction(async (prisma) => {
      // 1. Tạo medical record
      const medicalRecord = await prisma.medicalRecord.create({
        data: {
          ...recordData,
          patientId: patient.id,
          visitDate: data.visitDate ? this.parseVisitDateForCreate(data.visitDate) : new Date(),
          prescriptions:
            prescriptionCreateData.length > 0
              ? {
                  create: prescriptionCreateData,
                }
              : undefined,
        },
        include: {
          patient: {
            select: {
              firstName: true,
              lastName: true,
              employeeCode: true,
            },
          },
          doctor: {
            select: {
              firstName: true,
              lastName: true,
              employeeCode: true,
            },
          },
          prescriptions: {
            include: {
              medicine: true,
            },
          },
        },
      });

      // 2. Tự động trừ tồn kho cho mỗi prescription (pre-validation đã pass)
      if (prescriptions && prescriptions.length > 0) {
        for (const prescription of prescriptions) {
          const currentStock = await this.inventoryService.getCurrentStock(
            prescription.medicineId,
          );
          // Throw on inventory error so the outer transaction rolls back
          await this.inventoryService.createInventoryTransaction({
            medicineId: prescription.medicineId,
            type: InventoryTransactionTypeDto.EXPORT,
            quantity: prescription.quantity,
            unitPrice: String(currentStock.unitPrice || '0'),
            transactionDate: medicalRecord.visitDate.toISOString(),
            referenceType: 'MEDICAL_RECORD',
            referenceId: medicalRecord.id,
            notes: `Xuất thuốc theo đơn - Bệnh nhân: ${data.patientEmployeeCode}`,
            createdById: data.doctorId,
          });
        }
      }

      return medicalRecord;
    });
  }

  // Statistics and Analytics Methods

  async getMedicalRecords(filters: {
    doctorId?: string;
    patientEmployeeCode?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) {
    const { doctorId, patientEmployeeCode, startDate, endDate, page = 1, limit = 20 } = filters;

    const where: any = {};
    if (doctorId) where.doctorId = doctorId;
    if (patientEmployeeCode) {
      where.patient = { employeeCode: patientEmployeeCode };
    }
    if (startDate || endDate) {
      where.visitDate = {
        ...(startDate ? { gte: new Date(startDate) } : {}),
        ...(endDate ? { lte: new Date(endDate) } : {}),
      };
    }

    const skip = (page - 1) * limit;
    const [total, records] = await Promise.all([
      this.prisma.medicalRecord.count({ where }),
      this.prisma.medicalRecord.findMany({
        where,
        skip,
        take: limit,
        orderBy: { visitDate: 'desc' },
        include: {
          patient: { select: { firstName: true, lastName: true, employeeCode: true } },
          doctor: { select: { firstName: true, lastName: true, employeeCode: true } },
          prescriptions: { include: { medicine: { include: { category: true } } } },
        },
      }),
    ]);

    return { data: records, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async deleteMedicalRecord(id: string) {
    return this.prisma.$transaction(async (prisma) => {
      // Reverse inventory for all dispensed prescriptions
      const prescriptions = await prisma.medicalPrescription.findMany({
        where: { medicalRecordId: id },
        select: { medicineId: true, quantity: true, isDispensed: true },
      });

      for (const p of prescriptions) {
        if (p.isDispensed) {
          try {
            await this.inventoryService.reverseExportTransaction(p.medicineId, id);
          } catch (err) {
            // Log but continue — the record deletion takes priority
            console.error(`[deleteMedicalRecord] Lỗi hoàn trả tồn kho ${p.medicineId}:`, err);
          }
        }
      }

      // Delete prescriptions first (FK constraint), then record
      await prisma.medicalPrescription.deleteMany({ where: { medicalRecordId: id } });
      return prisma.medicalRecord.delete({ where: { id } });
    });
  }


  async getMedicineUsageStatistics(
    period: 'day' | 'week' | 'month' | 'year' = 'month',
    startDate?: string,
    endDate?: string,
  ) {
    const end = endDate ? new Date(endDate) : new Date();
    // Set end date to end of day to include all data from that day
    if (endDate) {
      end.setHours(23, 59, 59, 999);
    }

    const start = startDate
      ? new Date(startDate)
      : this.getDefaultStartDate(period, end);
    // Set start date to beginning of day
    if (startDate) {
      start.setHours(0, 0, 0, 0);
    }

    // Get prescriptions (filtered by visitDate through medicalRecord join) and medical records
    const [prescriptions, medicalRecords] = await Promise.all([
      this.prisma.medicalPrescription.findMany({
        where: {
          // Filter by visitDate of the parent medicalRecord, not createdAt of prescription
          // This ensures consistency: a record created today with a past visitDate is counted correctly
          medicalRecord: {
            visitDate: {
              gte: start,
              lte: end,
            },
          },
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
              units: true,
            },
          },
          medicalRecord: {
            select: {
              visitDate: true,
            },
          },
        },
      }),
      this.prisma.medicalRecord.findMany({
        where: {
          visitDate: {
            gte: start,
            lte: end,
          },
        },
        include: {
          prescriptions: true,
        },
      }),
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
          pending: 0,
        };
      }

      acc[medicineId].totalQuantity += prescription.isDispensed ? prescription.quantity : 0;
      acc[medicineId].totalPrescriptions += 1;

      if (prescription.isDispensed) {
        acc[medicineId].isDispensed += 1;
      } else {
        acc[medicineId].pending += 1;
      }

      return acc;
    }, {} as any);

    // Generate weekly/daily trends for chart
    const trends = await this.generateTrendsData(
      medicalRecords,
      prescriptions,
      period,
      start,
      end,
    );

    // Get accurate medicine distribution for the entire period
    const medicineDistribution = await this.getTopPrescribedMedicines(
      period,
      10,
      startDate,
      endDate,
    );

    // Get accurate total counts for the entire period — filter by visitDate (consistent with above)
    const totalStats = await Promise.all([
      this.prisma.medicalPrescription.groupBy({
        by: ['medicineId'],
        where: { medicalRecord: { visitDate: { gte: start, lte: end } } },
      }),
      this.prisma.medicalPrescription.count({
        where: { medicalRecord: { visitDate: { gte: start, lte: end } } },
      }),
    ]);

    return {
      period,
      dateRange: { start, end },
      totalMedicines: totalStats[0].length, // Accurate count of unique medicines
      totalPrescriptions: totalStats[1], // Accurate count of total prescriptions
      medicineStatistics: Object.values(medicineStats).sort(
        (a: any, b: any) => b.totalQuantity - a.totalQuantity,
      ),
      // Add trends data for charts
      weeklyTrends: trends,
      medicineDistribution: medicineDistribution.topMedicines, // Use accurate data from getTopPrescribedMedicines
    };
  }

  // Helper method to generate trends data for charts
  private async generateTrendsData(
    medicalRecords: any[],
    prescriptions: any[],
    period: 'day' | 'week' | 'month' | 'year',
    start: Date,
    end: Date,
  ) {
    const trends = [];

    // Calculate limit based on period
    let limit: number;
    if (period === 'day') {
      const diffTime = end.getTime() - start.getTime();
      const diffDays = Math.ceil(diffTime / (24 * 60 * 60 * 1000));
      limit = Math.min(diffDays + 1, 31);
    } else if (period === 'week') {
      limit = 7;
    } else if (period === 'month') {
      // Show every day in the month
      const daysInMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
      limit = daysInMonth;
    } else {
      // 'year' — show 12 months
      limit = 12;
    }

    for (let i = 0; i < limit; i++) {
      let periodStart: Date, periodEnd: Date, label: string;
      let skip = false;

      switch (period) {
        case 'day': {
          // For day filter: show days from start to end date
          periodStart = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
          periodStart.setHours(0, 0, 0, 0);
          periodEnd = new Date(periodStart);
          periodEnd.setHours(23, 59, 59, 999);

          // Skip if this date is beyond end date
          if (periodStart > end) { skip = true; break; }

          // Format: 10/9, 12/9, etc.
          label = `${periodStart.getDate()}/${periodStart.getMonth() + 1}`;
          break;
        }

        case 'week': {
          // For week filter: show individual days from end date backwards (last 7 days from endDate)
          periodStart = new Date(end.getTime() - i * 24 * 60 * 60 * 1000);
          periodStart.setHours(0, 0, 0, 0);
          periodEnd = new Date(periodStart);
          periodEnd.setHours(23, 59, 59, 999);

          // Format: 23/9, 24/9, 25/9, etc. (same as day format)
          label = `${periodStart.getDate()}/${periodStart.getMonth() + 1}`;
          break;
        }

        case 'month': {
          // Each day of the month
          periodStart = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
          periodStart.setHours(0, 0, 0, 0);
          periodEnd = new Date(periodStart);
          periodEnd.setHours(23, 59, 59, 999);
          if (periodStart > end) { skip = true; break; }
          // Just show day number — month is already known from the filter context
          label = `${periodStart.getDate()}`;
          break;
        }

        case 'year': {
          const reverseIndex = limit - 1 - i;
          const monthDate = new Date(
            end.getFullYear(),
            end.getMonth() - reverseIndex,
            1,
          );
          periodStart = monthDate;
          periodEnd = new Date(
            end.getFullYear(),
            end.getMonth() - reverseIndex + 1,
            0,
          );
          periodEnd.setHours(23, 59, 59, 999);
          label = `T${monthDate.getMonth() + 1}`;
          break;
        }

        default:
          continue;
      }

      if (skip) continue;

      // day/week/month: fetch per-day from DB; year: filter in-memory from pre-loaded data
      let periodExaminations = 0;
      let medicinesDispensed = 0;

      if (period === 'day' || period === 'week' || period === 'month') {
        // Fetch actual data for this specific day from database
        const [dayRecords, dayPrescriptions] = await Promise.all([
          this.prisma.medicalRecord.count({
            where: {
              visitDate: {
                gte: periodStart,
                lte: periodEnd,
              },
            },
          }),
          this.prisma.medicalPrescription.aggregate({
            where: {
              medicalRecord: {
                visitDate: {
                  gte: periodStart,
                  lte: periodEnd,
                },
              },
            },
            _sum: {
              quantity: true,
            },
          }),
        ]);

        periodExaminations = dayRecords;
        medicinesDispensed = dayPrescriptions._sum.quantity || 0;
      } else {
        // year: filter in-memory by month bucket
        const filteredRecords = medicalRecords.filter((record) => {
          const visitDate = new Date(record.visitDate);
          return visitDate >= periodStart && visitDate <= periodEnd;
        });

        const filteredPrescriptions = prescriptions.filter((p) => {
          const visitDate = new Date(p.medicalRecord.visitDate);
          return visitDate >= periodStart && visitDate <= periodEnd;
        });

        periodExaminations = filteredRecords.length;
        medicinesDispensed = filteredPrescriptions.reduce(
          (sum, p) => sum + p.quantity,
          0,
        );
      }

      trends.push({
        day: label,
        period: label,
        examinations: periodExaminations,
        medicines: medicinesDispensed,
        date: periodStart.toISOString(),
      });
    }

    return trends;
  }

  async getPrescriptionTrends(
    period: 'day' | 'week' | 'month' | 'year' = 'month',
    limit: number = 12,
  ) {
    const start = this.getDefaultStartDate(period, limit);
    const end = new Date();

    const prescriptions = await this.prisma.medicalPrescription.findMany({
      where: {
        createdAt: {
          gte: start,
          lte: end,
        },
      },
      include: {
        medicalRecord: {
          select: {
            visitDate: true,
          },
        },
      },
    });

    // Group by period
    const trends = this.groupByPeriod(prescriptions, period, limit);

    return {
      period,
      dateRange: { start, end },
      trends,
    };
  }

  async getTopPrescribedMedicines(
    period: 'day' | 'week' | 'month' | 'year' = 'month',
    limit: number = 10,
    startDate?: string,
    endDate?: string,
  ) {
    const end = endDate ? new Date(endDate) : new Date();
    // Set end date to end of day to include all data from that day
    if (endDate) {
      end.setHours(23, 59, 59, 999);
    }

    const start = startDate
      ? new Date(startDate)
      : this.getDefaultStartDate(period, end);
    // Set start date to beginning of day
    if (startDate) {
      start.setHours(0, 0, 0, 0);
    }

    const result = await this.prisma.medicalPrescription.groupBy({
      by: ['medicineId'],
      where: {
        isDispensed: true,
        createdAt: {
          gte: start,
          lte: end,
        },
      },
      _count: {
        id: true,
      },
      _sum: {
        quantity: true,
      },
      orderBy: {
        _count: {
          id: 'desc',
        },
      },
      take: limit,
    });

    // Get medicine details
    const medicineIds = result.map((r) => r.medicineId);
    const medicines = await this.prisma.medicine.findMany({
      where: {
        id: {
          in: medicineIds,
        },
      },
    });

    const medicineMap = medicines.reduce((acc, medicine) => {
      acc[medicine.id] = medicine;
      return acc;
    }, {} as any);

    const topMedicines = result.map((r) => ({
      medicine: medicineMap[r.medicineId],
      totalPrescriptions: r._count.id,
      totalQuantity: r._sum.quantity || 0,
    }));

    return {
      period,
      dateRange: { start, end },
      topMedicines,
    };
  }

  // Helper methods for date calculations - from working old code
  private getDefaultStartDate(
    period: 'day' | 'week' | 'month' | 'year',
    endDate?: Date | number,
  ): Date {
    const now = endDate
      ? endDate instanceof Date
        ? endDate
        : new Date()
      : new Date();

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
        // Start of current month (daily breakdown)
        const startOfMonth = new Date(now);
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        return startOfMonth;
      }
      case 'year': {
        // Start of current year (monthly breakdown)
        return new Date(now.getFullYear(), 0, 1);
      }
      default:
        return new Date(now.getFullYear(), now.getMonth() - 1, 1);
    }
  }

  private groupByPeriod(
    prescriptions: any[],
    period: 'day' | 'week' | 'month' | 'year',
    limit: number,
  ) {
    const trends = [];
    const now = new Date();

    for (let i = limit - 1; i >= 0; i--) {
      let periodStart: Date, periodEnd: Date, label: string;

      switch (period) {
        case 'day': {
          periodStart = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
          periodStart.setHours(0, 0, 0, 0);
          periodEnd = new Date(periodStart);
          periodEnd.setHours(23, 59, 59, 999);
          label = periodStart.toISOString().split('T')[0];
          break;
        }

        case 'week': {
          const weekStart = new Date(
            now.getTime() - i * 7 * 24 * 60 * 60 * 1000,
          );
          const dayOfWeek = weekStart.getDay();
          periodStart = new Date(
            weekStart.getTime() - dayOfWeek * 24 * 60 * 60 * 1000,
          );
          periodStart.setHours(0, 0, 0, 0);
          periodEnd = new Date(periodStart.getTime() + 6 * 24 * 60 * 60 * 1000);
          periodEnd.setHours(23, 59, 59, 999);

          // Calculate week number correctly within the month
          const firstDayOfMonth = new Date(
            periodStart.getFullYear(),
            periodStart.getMonth(),
            1,
          );
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

      const periodPrescriptions = prescriptions.filter((p) => {
        const createdAt = new Date(p.createdAt);
        return createdAt >= periodStart && createdAt <= periodEnd;
      });

      const totalQuantity = periodPrescriptions.reduce(
        (sum, p) => sum + p.quantity,
        0,
      );
      const dispensed = periodPrescriptions.filter((p) => p.isDispensed).length;

      trends.push({
        period: label,
        date: periodStart.toISOString(),
        totalPrescriptions: periodPrescriptions.length,
        totalQuantity,
        dispensedCount: dispensed,
        pendingCount: periodPrescriptions.length - dispensed,
      });
    }

    return trends;
  }

  private getWeekNumber(date: Date): number {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear =
      (date.getTime() - firstDayOfYear.getTime()) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  }

  /**
   * Get detailed healthcare statistics:
   * - Workers dispensed 1st / 2nd / 3rd+ time in the period
   * - Visits without medicine
   * - Total visits with medicine + total doses
   * - Work accident (TNLĐ) cases
   */
  async getDetailedStatistics(
    period: 'day' | 'week' | 'month' | 'year' = 'month',
    startDate?: string,
    endDate?: string,
  ) {
    const end = endDate ? new Date(endDate) : new Date();
    if (endDate) end.setHours(23, 59, 59, 999);

    let start: Date;
    if (startDate) {
      start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
    } else {
      const now = new Date(end);
      switch (period) {
        case 'day':
          start = new Date(now);
          start.setHours(0, 0, 0, 0);
          break;
        case 'week': {
          start = new Date(now);
          const day = start.getDay();
          const diff = day === 0 ? 6 : day - 1;
          start.setDate(start.getDate() - diff);
          start.setHours(0, 0, 0, 0);
          break;
        }
        case 'month':
          start = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case 'year':
          start = new Date(now.getFullYear(), 0, 1);
          break;
        default:
          start = new Date(now.getFullYear(), now.getMonth(), 1);
      }
    }

    // Fetch all medical records in the period with their prescriptions
    const records = await this.prisma.medicalRecord.findMany({
      where: {
        visitDate: { gte: start, lte: end },
      },
      include: {
        prescriptions: {
          select: { id: true, quantity: true, isDispensed: true },
        },
      },
    });

    // Count visits per patient in this period
    const visitCountByPatient = new Map<string, number>();
    // Count dispensed visits per patient (only visits where medicine was given)
    const dispensedCountByPatient = new Map<string, number>();
    for (const r of records) {
      visitCountByPatient.set(
        r.patientId,
        (visitCountByPatient.get(r.patientId) || 0) + 1,
      );
      const hasDispensed = r.prescriptions.some((p) => p.isDispensed);
      if (hasDispensed) {
        dispensedCountByPatient.set(
          r.patientId,
          (dispensedCountByPatient.get(r.patientId) || 0) + 1,
        );
      }
    }

    // Build dynamic frequency distribution: { times: N, workers: count }
    const frequencyMap = new Map<number, number>();
    for (const count of dispensedCountByPatient.values()) {
      frequencyMap.set(count, (frequencyMap.get(count) || 0) + 1);
    }
    const dispensingFrequency = Array.from(frequencyMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([times, workers]) => ({ times, workers }));

    // Backward-compat buckets
    const dispensedOnce = frequencyMap.get(1) || 0;
    const dispensedTwice = frequencyMap.get(2) || 0;
    const dispensedThreePlus = Array.from(frequencyMap.entries())
      .filter(([times]) => times >= 3)
      .reduce((sum, [, workers]) => sum + workers, 0);

    // Visits: with medicine vs without
    let visitsWithMedicine = 0;
    let visitsWithoutMedicine = 0;
    let totalDoses = 0;
    let workAccidentCases = 0;

    for (const r of records) {
      const hasDispensed = r.prescriptions.some((p) => p.isDispensed);
      if (hasDispensed) {
        visitsWithMedicine++;
        totalDoses += r.prescriptions
          .filter((p) => p.isDispensed)
          .reduce((sum, p) => sum + p.quantity, 0);
      } else {
        visitsWithoutMedicine++;
      }
      if (r.isWorkAccident) workAccidentCases++;
    }

    return {
      period,
      dateRange: { start, end },
      totalVisits: records.length,
      uniquePatients: visitCountByPatient.size,
      dispensingFrequency,  // Dynamic: [{times:1,workers:300},{times:2,workers:58},...]
      dispensedOnce,
      dispensedTwice,
      dispensedThreePlus,
      visitsWithMedicine,
      visitsWithoutMedicine,
      totalDoses,
      workAccidentCases,
    };
  }

  async getPatientVisitStats(
    period: 'day' | 'week' | 'month' | 'year' = 'month',
    startDate?: string,
    endDate?: string,
  ) {
    const end = endDate ? new Date(endDate) : new Date();
    if (endDate) end.setHours(23, 59, 59, 999);

    let start: Date;
    if (startDate) {
      start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
    } else {
      const now = new Date(end);
      switch (period) {
        case 'day':
          start = new Date(now);
          start.setHours(0, 0, 0, 0);
          break;
        case 'week': {
          start = new Date(now);
          const day = start.getDay();
          const diff = day === 0 ? 6 : day - 1;
          start.setDate(start.getDate() - diff);
          start.setHours(0, 0, 0, 0);
          break;
        }
        case 'month':
          start = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case 'year':
          start = new Date(now.getFullYear(), 0, 1);
          break;
        default:
          start = new Date(now.getFullYear(), now.getMonth(), 1);
      }
    }

    const now = new Date();
    const curMonth = now.getMonth() + 1;
    const curYear = now.getFullYear();

    const records = await this.prisma.medicalRecord.findMany({
      where: { visitDate: { gte: start, lte: end } },
      orderBy: { visitDate: 'desc' },
      include: {
        patient: {
          select: { firstName: true, lastName: true, employeeCode: true },
        },
        prescriptions: {
          where: { isDispensed: true },
          include: {
            medicine: {
              include: {
                inventoryBalances: {
                  where: { month: curMonth, year: curYear },
                  take: 1,
                  select: { closingUnitPrice: true },
                },
              },
            },
          },
        },
      },
    });

    const D = (v: any) => new Prisma.Decimal(v ?? 0);

    const patients = records.map((r) => {
      const totalValue = r.prescriptions.reduce(
        (sum, p) => {
          const price = p.medicine?.inventoryBalances?.[0]?.closingUnitPrice ?? 0;
          return sum.plus(D(price).times(p.quantity));
        },
        new Prisma.Decimal(0),
      );
      return {
        recordId: r.id,
        visitDate: r.visitDate,
        patientCode: r.patient?.employeeCode ?? '',
        patientName: `${r.patient?.firstName ?? ''} ${r.patient?.lastName ?? ''}`.trim(),
        isWorkAccident: r.isWorkAccident,
        symptoms: r.symptoms ?? '',
        diagnosis: r.diagnosis ?? '',
        medicines: r.prescriptions.map((p) => ({
          name: p.medicine?.name ?? '',
          units: p.medicine?.units ?? '',
          quantity: p.quantity,
          unitPrice: Number(p.medicine?.inventoryBalances?.[0]?.closingUnitPrice ?? 0),
        })),
        totalMedicines: r.prescriptions.length,
        totalValue: totalValue.toFixed(),
      };
    });

    const grandTotal = patients.reduce(
      (sum, p) => sum.plus(D(p.totalValue)),
      new Prisma.Decimal(0),
    );

    return {
      period,
      dateRange: { start, end },
      totalRecords: records.length,
      patients,
      grandTotal: grandTotal.toFixed(),
    };
  }

  async getVisitStatsByOffice(
    period: 'day' | 'week' | 'month' | 'year' = 'month',
    startDate?: string,
    endDate?: string,
  ) {
    const end = endDate ? new Date(endDate) : new Date();
    if (endDate) end.setHours(23, 59, 59, 999);

    let start: Date;
    if (startDate) {
      start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
    } else {
      const now = new Date(end);
      switch (period) {
        case 'day':
          start = new Date(now);
          start.setHours(0, 0, 0, 0);
          break;
        case 'week': {
          start = new Date(now);
          const day = start.getDay();
          const diff = day === 0 ? 6 : day - 1;
          start.setDate(start.getDate() - diff);
          start.setHours(0, 0, 0, 0);
          break;
        }
        case 'month':
          start = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case 'year':
          start = new Date(now.getFullYear(), 0, 1);
          break;
        default:
          start = new Date(now.getFullYear(), now.getMonth(), 1);
      }
    }

    const records = await this.prisma.medicalRecord.findMany({
      where: { visitDate: { gte: start, lte: end } },
      orderBy: { visitDate: 'desc' },
      select: {
        id: true,
        visitDate: true,
        isWorkAccident: true,
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeCode: true,
            office: { select: { id: true, name: true } },
          },
        },
      },
    });

    // Group by office
    const officeMap = new Map<
      string,
      {
        officeId: string;
        officeName: string;
        totalVisits: number;
        patients: Map<
          string,
          {
            patientId: string;
            patientCode: string;
            patientName: string;
            visitCount: number;
            lastVisit: Date;
            isWorkAccident: boolean;
          }
        >;
      }
    >();

    for (const r of records) {
      const officeId = r.patient?.office?.id ?? 'unknown';
      const officeName = r.patient?.office?.name ?? 'Không xác định';

      if (!officeMap.has(officeId)) {
        officeMap.set(officeId, {
          officeId,
          officeName,
          totalVisits: 0,
          patients: new Map(),
        });
      }
      const officeEntry = officeMap.get(officeId)!;
      officeEntry.totalVisits++;

      const patientId = r.patient?.id ?? r.id;
      if (!officeEntry.patients.has(patientId)) {
        officeEntry.patients.set(patientId, {
          patientId,
          patientCode: r.patient?.employeeCode ?? '',
          patientName:
            `${r.patient?.firstName ?? ''} ${r.patient?.lastName ?? ''}`.trim(),
          visitCount: 0,
          lastVisit: r.visitDate,
          isWorkAccident: r.isWorkAccident,
        });
      }
      const patientEntry = officeEntry.patients.get(patientId)!;
      patientEntry.visitCount++;
      if (r.visitDate > patientEntry.lastVisit) {
        patientEntry.lastVisit = r.visitDate;
      }
      if (r.isWorkAccident) patientEntry.isWorkAccident = true;
    }

    // Convert map → array, sort offices desc by totalVisits, patients desc by visitCount
    const offices = Array.from(officeMap.values())
      .sort((a, b) => b.totalVisits - a.totalVisits)
      .map((o) => ({
        officeId: o.officeId,
        officeName: o.officeName,
        totalVisits: o.totalVisits,
        uniquePatients: o.patients.size,
        patients: Array.from(o.patients.values()).sort(
          (a, b) => b.visitCount - a.visitCount,
        ),
      }));

    return {
      period,
      dateRange: { start, end },
      totalVisits: records.length,
      totalOffices: offices.length,
      offices,
    };
  }
}
