import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { CreateWorksheetDto } from './dto/create-worksheet.dto';
import { UpdateWorksheetDto } from './dto/update-worksheet.dto';
import { UpdateWorksheetRecordDto } from './dto/update-worksheet-record.dto';
import { BatchUpdateByHourDto, HourWorkerOutputDto } from './dto/batch-update-by-hour.dto';
import { Role, ShiftType, WorkSheetStatus, WorkRecordStatus } from '@prisma/client';
import { WorksheetGateway } from './worksheet.gateway';

@Injectable()
export class WorksheetService {
  constructor(
    private prisma: PrismaService,
    private worksheetGateway: WorksheetGateway,
  ) {}

  /**
   * Create worksheets for a group
   * Tạo phiếu công cho toàn bộ nhóm (bulk create)
   */
  async createWorksheet(createDto: CreateWorksheetDto, createdById: string) {
    const { groupId, workerIds, date, shiftType, productId, processId, plannedOutput } = createDto;

    // Validate input
    if (!groupId && !workerIds?.length) {
      throw new BadRequestException('Either groupId or workerIds must be provided');
    }

    // Get workers list
    let workers: any[];
    let group: any;
    let officeId: string; // Office = Factory for FACTORY_OFFICE type
    let finalGroupId: string;

    if (groupId) {
      // Get group with members and office (factory) info
      group = await this.prisma.group.findUnique({
        where: { id: groupId },
        include: {
          team: {
            include: {
              department: {
                include: { office: true }
              }
            }
          },
          members: {
            where: { isActive: true },
            select: { 
              id: true, 
              employeeCode: true, 
              firstName: true, 
              lastName: true 
            }
          }
        }
      });

      if (!group) {
        throw new NotFoundException('Group not found');
      }

      if (!group.team?.department?.office) {
        throw new BadRequestException('Group must belong to a factory office');
      }

      workers = group.members;
      officeId = group.team.department.office.id;
      finalGroupId = groupId;

      if (workers.length === 0) {
        throw new BadRequestException('Group has no active members');
      }
    } else {
      // Get workers by IDs
      workers = await this.prisma.user.findMany({
        where: { 
          id: { in: workerIds },
          isActive: true 
        },
        include: {
          group: {
            include: {
              team: {
                include: {
                  department: {
                    include: { office: true }
                  }
                }
              }
            }
          }
        }
      });

      if (workers.length === 0) {
        throw new NotFoundException('No active workers found');
      }

      // Use first worker's factory (office) and group
      const firstWorker = workers[0];
      if (!firstWorker.group?.team?.department?.office) {
        throw new BadRequestException('Workers must belong to a factory office');
      }

      if (!firstWorker.groupId) {
        throw new BadRequestException('Workers must belong to a group');
      }

      officeId = firstWorker.group.team.department.office.id;
      finalGroupId = firstWorker.groupId;
      group = firstWorker.group;
    }

    // Validate product-process combination
    const productProcess = await this.prisma.productProcess.findUnique({
      where: {
        productId_processId: { productId, processId }
      },
      include: {
        product: true,
        process: true
      }
    });

    if (!productProcess) {
      throw new BadRequestException('Invalid product-process combination');
    }

    // Check for existing worksheets on this date
    const dateObj = new Date(date);
    const existingCount = await this.prisma.workSheet.count({
      where: {
        date: dateObj,
        workerId: { in: workers.map(w => w.id) }
      }
    });

    if (existingCount > 0) {
      throw new BadRequestException(`${existingCount} worker(s) already have worksheets for this date`);
    }

    // Create worksheets for all workers in transaction
    const worksheets = await this.prisma.$transaction(async (tx) => {
      const created = [];

      for (const worker of workers) {
        // Create worksheet
        const worksheet = await tx.workSheet.create({
          data: {
            date: dateObj,
            workerId: worker.id,
            groupId: finalGroupId,
            officeId, // Office = Factory
            productId,
            processId,
            shiftType,
            plannedOutput,
            createdById,
            status: WorkSheetStatus.ACTIVE
          }
        });

        // Create records for each work hour
        const workHours = this.getWorkHoursForShift(shiftType);
        
        for (const { hour, startTime, endTime } of workHours) {
          await tx.workSheetRecord.create({
            data: {
              worksheetId: worksheet.id,
              workHour: hour,
              startTime: this.createDateTimeFromTimeString(dateObj, startTime),
              endTime: this.createDateTimeFromTimeString(dateObj, endTime),
              plannedOutput,
              status: WorkRecordStatus.PENDING
            }
          });
        }

        created.push(worksheet);
      }

      return created;
    });

    return {
      message: `Successfully created ${worksheets.length} worksheets`,
      totalWorkers: workers.length,
      totalWorksheets: worksheets.length,
      date: dateObj.toISOString().split('T')[0],
      group: {
        id: groupId,
        name: group?.name || 'N/A'
      },
      product: productProcess.product.name,
      process: productProcess.process.name,
      worksheets: worksheets.map(ws => ({
        id: ws.id,
        workerId: ws.workerId
      }))
    };
  }

  /**
   * Batch update outputs for all workers in a specific hour
   * Nhóm trưởng nhập sản lượng cho 30 công nhân trong 1 giờ
   */
  async batchUpdateByHour(
    groupId: string,
    workHour: number,
    batchDto: BatchUpdateByHourDto,
    user: any
  ) {
    // Verify group leader permission
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      select: { 
        id: true, 
        leaderId: true, 
        name: true,
        leader: { select: { id: true } }
      }
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    const canUpdate = 
      user.role === Role.SUPERADMIN ||
      user.role === Role.ADMIN ||
      group.leader?.id === user.id;

    if (!canUpdate) {
      throw new ForbiddenException('Only group leader can update records');
    }

    // Get all worksheets for this group on this date
    const dateObj = new Date(batchDto.date);
    const worksheets = await this.prisma.workSheet.findMany({
      where: {
        groupId,
        date: dateObj
      },
      include: {
        records: {
          where: { workHour },
          include: {
            items: true
          }
        }
      }
    });

    if (worksheets.length === 0) {
      throw new NotFoundException('No worksheets found for this group and date');
    }

    // Build map: workerId -> worksheet
    const worksheetMap = new Map(
      worksheets.map(ws => [ws.workerId, ws])
    );

    // Update all records in transaction
    const result = await this.prisma.$transaction(async (tx) => {
      const updates = [];

      for (const output of batchDto.outputs) {
        const worksheet = worksheetMap.get(output.workerId);
        
        if (!worksheet) {
          continue; // Skip workers not in this group
        }

        const record = worksheet.records[0];
        
        if (!record) {
          throw new BadRequestException(`No record found for hour ${workHour}`);
        }

        // Delete existing items
        await tx.workSheetRecordItem.deleteMany({
          where: { recordId: record.id }
        });

        // Create new items
        let totalActual = 0;
        let totalPlanned = 0;
        let entryIndex = 1;

        for (const entry of output.entries) {
          // ⭐ Use entry.plannedOutput if provided, otherwise fallback to worksheet.plannedOutput
          const entryPlanned = entry.plannedOutput ?? worksheet.plannedOutput;
          
          await tx.workSheetRecordItem.create({
            data: {
              recordId: record.id,
              entryIndex: entryIndex++,
              productId: entry.productId,
              processId: entry.processId,
              plannedOutput: entryPlanned, // ⭐ Save planned for this entry
              actualOutput: entry.actualOutput,
              note: entry.note
            }
          });

          totalActual += entry.actualOutput;
          totalPlanned += entryPlanned; // ⭐ Sum planned output
        }

        // Update record totals - now with summed plannedOutput
        const updated = await tx.workSheetRecord.update({
          where: { id: record.id },
          data: {
            plannedOutput: totalPlanned, // ⭐ Save summed planned for this hour
            actualOutput: totalActual,
            status: WorkRecordStatus.COMPLETED,
            updatedById: user.id
          },
          include: {
            items: {
              include: {
                product: { select: { name: true, code: true } },
                process: { select: { name: true, code: true } }
              }
            }
          }
        });

        updates.push({
          workerId: output.workerId,
          recordId: record.id,
          totalActual,
          itemsCount: output.entries.length
        });
      }

      return updates;
    });

    console.log('✅ [BATCH UPDATE] Success:', {
      groupId,
      workHour,
      date: batchDto.date,
      totalOutputs: batchDto.outputs.length,
      updateResults: result.length
    });

    // ⭐ EMIT SOCKET EVENT: Real-time update
    this.worksheetGateway.emitWorksheetUpdate({
      groupId,
      date: batchDto.date,
      workHour,
      affectedWorkers: result.length,
    });

    return {
      message: `Updated ${result.length} workers for hour ${workHour}`,
      groupId,
      workHour,
      date: batchDto.date,
      updates: result
    };
  }

  /**
   * Get worksheets grid view for a group (matrix: workers × hours)
   * Dùng cho UI hiển thị bảng công
   */
  async getWorksheetGrid(groupId: string, date: Date, user: any) {
    // Check permission
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      select: { 
        leaderId: true, 
        name: true,
        leader: { select: { id: true } }
      }
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    const canView = 
      user.role === Role.SUPERADMIN ||
      user.role === Role.ADMIN ||
      group.leader?.id === user.id;

    if (!canView) {
      throw new ForbiddenException('No permission to view this group');
    }

    // Get all worksheets for this group on this date
    const dateObj = new Date(date);
    const worksheets = await this.prisma.workSheet.findMany({
      where: {
        groupId,
        date: dateObj
      },
      include: {
        worker: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true
          }
        },
        product: { select: { id: true, name: true } },
        process: { select: { id: true, name: true } },
        records: {
          include: {
            items: {
              include: {
                product: { select: { name: true, code: true } },
                process: { select: { name: true, code: true } }
              },
              orderBy: { entryIndex: 'asc' }
            }
          },
          orderBy: { workHour: 'asc' }
        }
      },
      orderBy: {
        worker: { employeeCode: 'asc' }
      }
    });

    // Transform to grid format
    const grid = worksheets.map(ws => {
      const hours = ws.records.map(record => ({
        workHour: record.workHour,
        startTime: record.startTime,
        endTime: record.endTime,
        plannedOutput: record.plannedOutput, // ⭐ Sum of items' plannedOutput
        actualOutput: record.actualOutput,
        status: record.status,
        items: record.items.map(item => ({
          entryIndex: item.entryIndex,
          productId: item.productId,  // ⭐ ADD: For frontend fallback
          processId: item.processId,  // ⭐ ADD: For frontend fallback
          product: {
            id: item.productId,
            ...item.product
          },
          process: {
            id: item.processId,
            ...item.process
          },
          plannedOutput: item.plannedOutput, // ⭐ ADD: SLKH for this entry
          actualOutput: item.actualOutput,
          note: item.note
        }))
      }));

      // ⭐ Calculate totalPlanned with fallback logic and hour duration coefficient
      // If record.plannedOutput is null (old data), use worksheet.plannedOutput
      // ⭐ Hour 9 in EXTENDED_9_5H is 1.5 hours (16:30-18:00), multiply by 1.5
      const totalPlanned = ws.records.reduce((sum, r) => {
        const hourCoefficient = (ws.shiftType === ShiftType.EXTENDED_9_5H && r.workHour === 9) ? 1.5 : 1;
        
        if (r.plannedOutput && r.plannedOutput > 0) {
          // New data: use summed plannedOutput from items
          return sum + (r.plannedOutput * hourCoefficient);
        } else {
          // Old data: fallback to worksheet.plannedOutput
          return sum + (ws.plannedOutput * hourCoefficient);
        }
      }, 0);
      
      const totalActual = ws.records.reduce((sum, r) => 
        sum + r.items.reduce((itemSum, item) => itemSum + (item.actualOutput || 0), 0), 0
      );
      const efficiency = totalPlanned > 0 ? Math.round((totalActual / totalPlanned) * 100) : 0;

      return {
        worksheetId: ws.id,
        worker: ws.worker,
        defaultProduct: ws.product,
        defaultProcess: ws.process,
        plannedOutputPerHour: ws.plannedOutput,
        shiftType: ws.shiftType,
        hours,
        summary: {
          totalPlanned,
          totalActual,
          efficiency
        }
      };
    });

    return {
      group: {
        id: groupId,
        name: group.name
      },
      date: dateObj.toISOString().split('T')[0],
      totalWorkers: grid.length,
      workers: grid
    };
  }

  // Helper methods
  private getWorkHoursForShift(shiftType: ShiftType) {
    const baseHours = [
      { hour: 1, startTime: '07:30', endTime: '08:30' },
      { hour: 2, startTime: '08:30', endTime: '09:30' },
      { hour: 3, startTime: '09:30', endTime: '10:30' },
      { hour: 4, startTime: '10:30', endTime: '11:30' },
      // ⭐ SKIP: 11:30-12:30 (Lunch break - not included in any shift)
      { hour: 5, startTime: '12:30', endTime: '13:30' },
      { hour: 6, startTime: '13:30', endTime: '14:30' },
      { hour: 7, startTime: '14:30', endTime: '15:30' },
      { hour: 8, startTime: '15:30', endTime: '16:30' }
    ];

    switch (shiftType) {
      case ShiftType.EXTENDED_9_5H:
        // Ca 9.5h: 8 giờ + 1.5 giờ (16:30-18:00)
        return [
          ...baseHours,
          { hour: 9, startTime: '16:30', endTime: '18:00' }
        ];
      case ShiftType.OVERTIME_11H:
        // Ca 11h: 8 giờ + nghỉ chiều (16:30-17:00) + 3 giờ tăng ca (17:00-20:00)
        // ⭐ SKIP: 16:30-17:00 (Afternoon break - not included)
        return [
          ...baseHours,
          { hour: 9, startTime: '17:00', endTime: '18:00' },
          { hour: 10, startTime: '18:00', endTime: '19:00' },
          { hour: 11, startTime: '19:00', endTime: '20:00' }
        ];
      case ShiftType.NORMAL_8H:
      default:
        // Ca 8h: Chỉ có 8 giờ cơ bản
        return baseHours;
    }
  }

  private createDateTimeFromTimeString(date: Date, timeString: string): Date {
    const [hours, minutes] = timeString.split(':').map(Number);
    
    if (isNaN(hours) || isNaN(minutes)) {
      throw new BadRequestException(`Invalid time string: ${timeString}`);
    }
    
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();
    
    return new Date(Date.UTC(year, month, day, hours, minutes, 0, 0));
  }

  /**
   * Find all worksheets with filters
   */
  async findAll(filters: {
    factoryId?: string;
    groupId?: string;
    departmentId?: string; // ⭐ Filter by Department (= Line for production)
    date?: Date;
    status?: string;
    userId?: string;
    userRole?: Role;
  }) {
    const where: any = {};

    if (filters.factoryId) {
      where.officeId = filters.factoryId; // factoryId is now officeId
    }

    if (filters.groupId) {
      where.groupId = filters.groupId;
    }

    // ⭐ Filter by Department (= Line for production departments)
    if (filters.departmentId) {
      console.log('[WorksheetService] Filtering by Department:', filters.departmentId);
      
      // Find all groups in this Department (through Team)
      const groupsInDept = await this.prisma.group.findMany({
        where: {
          team: {
            departmentId: filters.departmentId
          }
        },
        select: { id: true, name: true, teamId: true, team: { select: { name: true, departmentId: true } } }
      });

      console.log('[WorksheetService] Groups found in Department:', {
        departmentId: filters.departmentId,
        groupCount: groupsInDept.length,
        groups: groupsInDept.map(g => ({ id: g.id, name: g.name, teamId: g.teamId, teamName: g.team?.name, departmentId: g.team?.departmentId }))
      });

      if (groupsInDept.length > 0) {
        where.groupId = { in: groupsInDept.map(g => g.id) };
      } else {
        // No groups in this Department, return empty
        console.warn('[WorksheetService] No groups found for Department:', filters.departmentId);
        return [];
      }
    }

    if (filters.date) {
      // Parse date string correctly (assume input is already in UTC)
      const dateObj = typeof filters.date === 'string' 
        ? new Date(filters.date) 
        : filters.date;
      
      // Extract year, month, day in UTC
      const year = dateObj.getUTCFullYear();
      const month = dateObj.getUTCMonth();
      const day = dateObj.getUTCDate();
      
      // Create UTC dates for the full day
      const startDate = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
      const endDate = new Date(Date.UTC(year, month, day + 1, 0, 0, 0, 0));
      
      where.date = {
        gte: startDate,
        lt: endDate,
      };
    }

    if (filters.status) {
      where.status = filters.status;
    }

    // Role-based filtering
    if (filters.userRole === Role.USER && filters.userId) {
      // Group leader can only see their group's worksheets
      const ledGroups = await this.prisma.group.findMany({
        where: { leaderId: filters.userId },
        select: { id: true }
      });

      if (ledGroups.length > 0) {
        where.groupId = { in: ledGroups.map(g => g.id) };
      } else {
        // Not a leader, return empty
        return [];
      }
    }

    const worksheets = await this.prisma.workSheet.findMany({
      where,
      include: {
        office: { select: { name: true } },
        group: {
          select: {
            id: true,
            name: true,
            code: true,
            team: {
              select: {
                name: true,
                department: { select: { name: true } }
              }
            }
          }
        },
        worker: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true
          }
        },
        product: { select: { id: true, name: true } },
        process: { select: { id: true, name: true } },
        createdBy: { select: { firstName: true, lastName: true, employeeCode: true } },
        records: {
          select: {
            workHour: true,
            plannedOutput: true,
            status: true,
            items: {
              select: {
                actualOutput: true,
                plannedOutput: true
              }
            }
          }
        },
        _count: {
          select: {
            records: {
              where: { status: WorkRecordStatus.COMPLETED }
            }
          }
        }
      },
      orderBy: [
        { date: 'desc' },
        { createdAt: 'desc' }
      ]
    });

    return worksheets.map(ws => {
      // ⭐ NEW LOGIC with SLKH per entry: SUM record.plannedOutput across all hours
      // Each record.plannedOutput = SUM of items' plannedOutput for that hour
      // ⭐ IMPORTANT: Hour 9 in EXTENDED_9_5H shift is 1.5 hours long (16:30-18:00), so multiply by 1.5
      // Fallback to old calculation if record.plannedOutput is null (backward compatibility)
      const totalPlanned = ws.records.reduce((sum, r) => {
        // Calculate hour duration coefficient (1.5x for hour 9 in 9.5h shift)
        const hourCoefficient = (ws.shiftType === ShiftType.EXTENDED_9_5H && r.workHour === 9) ? 1.5 : 1;
        
        if (r.plannedOutput && r.plannedOutput > 0) {
          // New data: record already has summed plannedOutput from items
          return sum + (r.plannedOutput * hourCoefficient);
        } else {
          // Old data: fallback to worksheet.plannedOutput per hour
          return sum + (ws.plannedOutput * hourCoefficient);
        }
      }, 0);
      
      const totalActual = ws.records.reduce((sum, r) => 
        sum + r.items.reduce((itemSum, item) => itemSum + (item.actualOutput || 0), 0), 0
      )
      
      // Get unique completed hour slots (workHour values for COMPLETED records)
      const completedHourSlots = ws.records
        .filter(r => r.status === WorkRecordStatus.COMPLETED)
        .map(r => r.workHour)
      
      return {
        id: ws.id,
        date: ws.date.toISOString().split('T')[0],
        worker: ws.worker,
        group: ws.group,
        office: ws.office,
        productId: ws.productId,
        processId: ws.processId,
        product: ws.product,
        process: ws.process,
        shiftType: ws.shiftType,
        plannedOutput: ws.plannedOutput,
        status: ws.status,
        completedRecords: ws._count.records,
        completedHourSlots, // Array of completed hour numbers [1, 2, 3, etc.]
        summary: {
          totalPlanned,
          totalActual,
          efficiency: totalPlanned > 0 ? Math.round((totalActual / totalPlanned) * 100) : 0
        },
        createdBy: ws.createdBy,
        createdAt: ws.createdAt,
        updatedAt: ws.updatedAt
      }
    });
  }

  /**
   * Find one worksheet by ID
   */
  async findOne(id: string, user: any) {
    const worksheet = await this.prisma.workSheet.findUnique({
      where: { id },
      include: {
        office: { select: { name: true } },
        group: {
          include: {
            team: {
              include: {
                department: { select: { name: true } }
              }
            },
            leader: {
              select: {
                id: true,
                employeeCode: true,
                firstName: true,
                lastName: true
              }
            }
          }
        },
        worker: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true
          }
        },
        product: { select: { name: true, code: true } },
        process: { select: { name: true, code: true } },
        createdBy: { select: { firstName: true, lastName: true, employeeCode: true } },
        records: {
          include: {
            items: {
              include: {
                product: { select: { name: true, code: true } },
                process: { select: { name: true, code: true } }
              },
              orderBy: { entryIndex: 'asc' }
            },
            updatedBy: { select: { firstName: true, lastName: true } }
          },
          orderBy: { workHour: 'asc' }
        }
      }
    });

    if (!worksheet) {
      throw new NotFoundException('Worksheet not found');
    }

    // Check permissions
    const canAccess = 
      user.role === Role.SUPERADMIN ||
      user.role === Role.ADMIN ||
      worksheet.createdById === user.id ||
      worksheet.group.leader?.id === user.id ||
      worksheet.workerId === user.id;

    if (!canAccess) {
      throw new ForbiddenException('No permission to access this worksheet');
    }

    // Calculate summary
    const totalPlanned = worksheet.records.reduce((sum, r) => sum + (r.plannedOutput || 0), 0);
    
    // ⭐ FIX: Calculate totalActual from items, not records
    const totalActual = worksheet.records.reduce((sum, r) => 
      sum + r.items.reduce((itemSum, item) => itemSum + (item.actualOutput || 0), 0), 0
    );
    
    const completedRecords = worksheet.records.filter(r => r.status === WorkRecordStatus.COMPLETED).length;
    const efficiency = totalPlanned > 0 ? Math.round((totalActual / totalPlanned) * 100) : 0;

    return {
      ...worksheet,
      summary: {
        totalRecords: worksheet.records.length,
        completedRecords,
        totalPlanned,
        totalActual,
        efficiency
      }
    };
  }

  /**
   * Update worksheet
   * Supports updating: shiftType, plannedOutput, productId, processId, status
   * When shiftType changes, recreates records with new shift duration
   */
  async update(id: string, updateDto: UpdateWorksheetDto, user: any) {
    const worksheet = await this.prisma.workSheet.findUnique({
      where: { id },
      include: { 
        group: { 
          select: { 
            leaderId: true,
            leader: { select: { id: true } }
          } 
        },
        records: { select: { id: true, workHour: true, actualOutput: true, status: true } }
      }
    });

    if (!worksheet) {
      throw new NotFoundException('Worksheet not found');
    }

    // Check permissions
    const canUpdate = 
      user.role === Role.SUPERADMIN ||
      user.role === Role.ADMIN ||
      worksheet.createdById === user.id ||
      worksheet.group.leader?.id === user.id;

    if (!canUpdate) {
      throw new ForbiddenException('No permission to update this worksheet');
    }

    return this.prisma.$transaction(async (tx) => {
      // If shiftType changed, need to recreate records
      if (updateDto.shiftType && updateDto.shiftType !== worksheet.shiftType) {
        const oldShiftHours = this.getShiftHours(worksheet.shiftType);
        const newShiftHours = this.getShiftHours(updateDto.shiftType);

        // Delete records beyond new shift duration
        if (newShiftHours < oldShiftHours) {
          const recordsToDelete = worksheet.records.filter(r => r.workHour > newShiftHours);
          await tx.workSheetRecord.deleteMany({
            where: { id: { in: recordsToDelete.map(r => r.id) } }
          });
        }

        // Create new records if shift extended
        if (newShiftHours > oldShiftHours) {
          const existingHours = worksheet.records.map(r => r.workHour);
          const workHourSchedule = this.getWorkHoursForShift(updateDto.shiftType);
          const newRecords = [];
          
          for (let hour = oldShiftHours + 1; hour <= newShiftHours; hour++) {
            if (!existingHours.includes(hour)) {
              const schedule = workHourSchedule.find(s => s.hour === hour);
              if (schedule) {
                newRecords.push({
                  worksheetId: id,
                  workHour: hour,
                  startTime: this.createDateTimeFromTimeString(worksheet.date, schedule.startTime),
                  endTime: this.createDateTimeFromTimeString(worksheet.date, schedule.endTime),
                  plannedOutput: updateDto.plannedOutput || worksheet.plannedOutput,
                  actualOutput: 0,
                  status: WorkRecordStatus.PENDING
                });
              }
            }
          }

          if (newRecords.length > 0) {
            await tx.workSheetRecord.createMany({
              data: newRecords
            });
          }
        }
      }

      // Update worksheet
      const updated = await tx.workSheet.update({
        where: { id },
        data: {
          shiftType: updateDto.shiftType,
          plannedOutput: updateDto.plannedOutput,
          productId: updateDto.productId,
          processId: updateDto.processId,
          status: updateDto.status
        },
        include: {
          office: { select: { name: true } },
          group: { select: { name: true, id: true, leader: { select: { id: true } } } },
          worker: { select: { firstName: true, lastName: true, employeeCode: true } },
          product: { select: { name: true, code: true } },
          process: { select: { name: true, code: true } },
          records: {
            include: {
              items: {
                include: {
                  product: { select: { name: true, code: true } },
                  process: { select: { name: true, code: true } }
                }
              }
            },
            orderBy: { workHour: 'asc' }
          }
        }
      });

      // Emit WebSocket update to refresh group view
      if (updated.group) {
        this.worksheetGateway.emitWorksheetUpdate({
          groupId: updated.group.id,
          date: worksheet.date.toISOString().split('T')[0],
          affectedWorkers: 1
        });
      }

      return updated;
    });
  }

  /**
   * Get shift duration in hours
   */
  private getShiftHours(shiftType: ShiftType): number {
    switch (shiftType) {
      case ShiftType.NORMAL_8H:
        return 8;
      case ShiftType.EXTENDED_9_5H:
        return 9; // 9.5 rounded down
      case ShiftType.OVERTIME_11H:
        return 11;
      default:
        return 8;
    }
  }

  /**
   * Bulk update all worksheets in a group
   * Updates shift type, product, process, and planned output for entire group
   */
  async bulkUpdateGroupWorksheets(
    groupId: string, 
    bulkUpdateDto: any, 
    user: any
  ) {
    const { date, shiftType, plannedOutput, productId, processId } = bulkUpdateDto;

    // Verify group exists and user has permission
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      select: { 
        id: true, 
        name: true, 
        leaderId: true,
        leader: { select: { id: true } },
        members: { where: { isActive: true }, select: { id: true } }
      }
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    // Check permissions
    const canUpdate = 
      user.role === Role.SUPERADMIN ||
      user.role === Role.ADMIN ||
      group.leader?.id === user.id;

    if (!canUpdate) {
      throw new ForbiddenException('Only group leader or admin can bulk update worksheets');
    }

    // Find all worksheets for this group on the specified date
    const worksheets = await this.prisma.workSheet.findMany({
      where: {
        groupId,
        date: new Date(date)
      },
      include: {
        records: { select: { id: true, workHour: true, status: true } }
      }
    });

    if (worksheets.length === 0) {
      throw new NotFoundException('No worksheets found for this group and date');
    }

    // Perform bulk update in transaction
    return this.prisma.$transaction(async (tx) => {
      const updatedWorksheets = [];

      for (const worksheet of worksheets) {
        // Handle shift type change
        if (shiftType && shiftType !== worksheet.shiftType) {
          const oldShiftHours = this.getShiftHours(worksheet.shiftType);
          const newShiftHours = this.getShiftHours(shiftType);

          // Delete records beyond new shift duration
          if (newShiftHours < oldShiftHours) {
            const recordsToDelete = worksheet.records.filter(r => r.workHour > newShiftHours);
            await tx.workSheetRecord.deleteMany({
              where: { id: { in: recordsToDelete.map(r => r.id) } }
            });
          }

          // Create new records if shift extended
          if (newShiftHours > oldShiftHours) {
            const existingHours = worksheet.records.map(r => r.workHour);
            const workHourSchedule = this.getWorkHoursForShift(shiftType);
            const newRecords = [];
            
            for (let hour = oldShiftHours + 1; hour <= newShiftHours; hour++) {
              if (!existingHours.includes(hour)) {
                const schedule = workHourSchedule.find(s => s.hour === hour);
                if (schedule) {
                  newRecords.push({
                    worksheetId: worksheet.id,
                    workHour: hour,
                    startTime: this.createDateTimeFromTimeString(worksheet.date, schedule.startTime),
                    endTime: this.createDateTimeFromTimeString(worksheet.date, schedule.endTime),
                    plannedOutput: plannedOutput || worksheet.plannedOutput,
                    actualOutput: 0,
                    status: WorkRecordStatus.PENDING
                  });
                }
              }
            }

            if (newRecords.length > 0) {
              await tx.workSheetRecord.createMany({
                data: newRecords
              });
            }
          }
        }

        // Update worksheet
        const updated = await tx.workSheet.update({
          where: { id: worksheet.id },
          data: {
            shiftType,
            plannedOutput,
            productId,
            processId
          }
        });

        updatedWorksheets.push(updated);
      }

      // Emit WebSocket update
      this.worksheetGateway.emitWorksheetUpdate({
        groupId,
        date,
        affectedWorkers: updatedWorksheets.length
      });

      return {
        success: true,
        updatedCount: updatedWorksheets.length,
        groupId,
        date,
        changes: {
          shiftType: shiftType || null,
          plannedOutput: plannedOutput || null,
          productId: productId || null,
          processId: processId || null
        }
      };
    });
  }

  /**
   * Update single record
   */
  async updateRecord(
    worksheetId: string,
    recordId: string,
    updateDto: UpdateWorksheetRecordDto,
    user: any
  ) {
    // Validate worksheet and record exist
    const worksheet = await this.prisma.workSheet.findUnique({
      where: { id: worksheetId },
      include: {
        group: { select: { leaderId: true, leader: { select: { id: true } } } },
        records: { where: { id: recordId } }
      }
    });

    if (!worksheet) {
      throw new NotFoundException('Worksheet not found');
    }

    const record = worksheet.records[0];
    if (!record) {
      throw new NotFoundException('Record not found');
    }

    // Check permissions
    const canUpdate = 
      user.role === Role.SUPERADMIN ||
      user.role === Role.ADMIN ||
      worksheet.group.leader?.id === user.id;

    if (!canUpdate) {
      throw new ForbiddenException('Only group leader can update records');
    }

    // Update record with transaction
    return this.prisma.$transaction(async (tx) => {
      // Delete existing items
      await tx.workSheetRecordItem.deleteMany({
        where: { recordId: record.id }
      });

      // Create new item entry
      if (updateDto.actualOutput !== undefined) {
        await tx.workSheetRecordItem.create({
          data: {
            recordId: record.id,
            entryIndex: 1,
            productId: updateDto.productId || worksheet.productId,
            processId: updateDto.processId || worksheet.processId,
            actualOutput: updateDto.actualOutput,
            plannedOutput: updateDto.plannedOutput || worksheet.plannedOutput,
            note: updateDto.note
          }
        });
      }

      // Update record
      return tx.workSheetRecord.update({
        where: { id: record.id },
        data: {
          actualOutput: updateDto.actualOutput,
          plannedOutput: updateDto.plannedOutput || record.plannedOutput,
          status: updateDto.status || WorkRecordStatus.COMPLETED,
          updatedById: user.id
        },
        include: {
          items: {
            include: {
              product: { select: { name: true, code: true } },
              process: { select: { name: true, code: true } }
            }
          }
        }
      });
    });
  }

  /**
   * Delete worksheet
   */
  async remove(id: string, user: any) {
    const worksheet = await this.prisma.workSheet.findUnique({
      where: { id }
    });

    if (!worksheet) {
      throw new NotFoundException('Worksheet not found');
    }

    // Only admin can delete
    if (user.role !== Role.SUPERADMIN && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Only admin can delete worksheets');
    }

    return this.prisma.workSheet.delete({
      where: { id }
    });
  }

  /**
   * Complete worksheet
   */
  async completeWorksheet(id: string, user: any) {
    const worksheet = await this.prisma.workSheet.findUnique({
      where: { id },
      include: { group: { select: { leaderId: true, leader: { select: { id: true } } } } }
    });

    if (!worksheet) {
      throw new NotFoundException('Worksheet not found');
    }

    // Check permissions
    const canComplete = 
      user.role === Role.SUPERADMIN ||
      user.role === Role.ADMIN ||
      worksheet.group.leader?.id === user.id;

    if (!canComplete) {
      throw new ForbiddenException('No permission to complete this worksheet');
    }

    return this.prisma.workSheet.update({
      where: { id },
      data: { status: WorkSheetStatus.COMPLETED }
    });
  }

  /**
   * Get my group worksheets (for group leaders)
   */
  async getMyGroupWorksheets(userId: string, date: Date) {
    // Find groups where user is the leader
    const myGroups = await this.prisma.group.findMany({
      where: { leaderId: userId },
      select: { id: true }
    });

    const groupIds = myGroups.map(g => g.id);

    if (groupIds.length === 0) {
      throw new NotFoundException('You are not a group leader');
    }

    const dateObj = new Date(date);
    const worksheets = await this.prisma.workSheet.findMany({
      where: {
        groupId: { in: groupIds },
        date: {
          gte: new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()),
          lt: new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate() + 1),
        }
      },
      include: {
        office: { select: { name: true } },
        group: { select: { name: true, code: true, leader: { select: { id: true } } } },
        worker: { select: { firstName: true, lastName: true, employeeCode: true } },
        records: {
          include: {
            items: true
          },
          orderBy: { workHour: 'asc' }
        },
        _count: {
          select: {
            records: { where: { status: WorkRecordStatus.COMPLETED } }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return worksheets.map(ws => {
      // ⭐ FIX: Calculate totalActual from items
      const totalPlanned = ws.records.reduce((sum, r) => sum + (r.plannedOutput || 0), 0);
      const totalActual = ws.records.reduce((sum, r) => 
        sum + r.items.reduce((itemSum, item) => itemSum + (item.actualOutput || 0), 0), 0
      );
      const efficiency = totalPlanned > 0 ? Math.round((totalActual / totalPlanned) * 100) : 0;

      return {
        id: ws.id,
        date: ws.date.toISOString().split('T')[0],
        worker: ws.worker,
        group: ws.group,
        office: ws.office,
        completedRecords: ws._count.records,
        totalRecords: ws.records.length,
        totalPlanned,
        totalActual,
        efficiency,
        status: ws.status
      };
    });
  }

  /**
   * Get analytics for dashboard
   */
  async getAnalytics(worksheetId: string, user: any) {
    const worksheet = await this.prisma.workSheet.findUnique({
      where: { id: worksheetId },
      include: {
        group: { select: { leaderId: true, leader: { select: { id: true } } } },
        records: {
          include: {
            items: {
              include: {
                product: { select: { name: true, code: true } },
                process: { select: { name: true, code: true } }
              }
            }
          },
          orderBy: { workHour: 'asc' }
        }
      }
    });

    if (!worksheet) {
      throw new NotFoundException('Worksheet not found');
    }

    // Check permissions
    const canView = 
      user.role === Role.SUPERADMIN ||
      user.role === Role.ADMIN ||
      worksheet.group.leader?.id === user.id;

    if (!canView) {
      throw new ForbiddenException('No permission to view analytics');
    }

    // Calculate analytics
    const totalRecords = worksheet.records.length;
    const completedRecords = worksheet.records.filter(r => r.status === WorkRecordStatus.COMPLETED).length;
    
    // ⭐ FIX: totalPlanned from records, totalActual from items
    const totalPlanned = worksheet.records.reduce((sum, r) => sum + (r.plannedOutput || 0), 0);
    const totalActual = worksheet.records.reduce((sum, r) => 
      sum + r.items.reduce((itemSum, item) => itemSum + (item.actualOutput || 0), 0), 0
    );
    const efficiency = totalPlanned > 0 ? Math.round((totalActual / totalPlanned) * 100) : 0;

    // Hourly breakdown
    const hourlyData = worksheet.records.map(record => {
      const itemsActual = record.items.reduce((sum, item) => sum + item.actualOutput, 0);
      const recordEfficiency = record.plannedOutput && record.plannedOutput > 0
        ? Math.round((itemsActual / record.plannedOutput) * 100)
        : 0;

      return {
        workHour: record.workHour,
        startTime: record.startTime,
        endTime: record.endTime,
        plannedOutput: record.plannedOutput,
        actualOutput: record.actualOutput,
        efficiency: recordEfficiency,
        status: record.status,
        itemsCount: record.items.length,
        products: record.items.map(item => ({
          product: item.product,
          process: item.process,
          actualOutput: item.actualOutput
        }))
      };
    });

    return {
      summary: {
        totalRecords,
        completedRecords,
        completionRate: totalRecords > 0 ? Math.round((completedRecords / totalRecords) * 100) : 0,
        totalPlanned,
        totalActual,
        efficiency
      },
      hourlyData,
      trends: {
        peakHour: hourlyData.reduce((max, hour) => 
          (hour.actualOutput || 0) > (max.actualOutput || 0) ? hour : max,
          { workHour: 0, actualOutput: 0 }
        ),
        lowestHour: hourlyData.reduce((min, hour) => 
          (hour.actualOutput || 0) < (min.actualOutput || 0) ? hour : min,
          { workHour: 0, actualOutput: Infinity }
        )
      }
    };
  }

  /**
   * Get group worksheets for a specific date
   */
  async getGroupWorksheets(groupId: string, date: Date, user: any) {
    // Check permission
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      select: { 
        leaderId: true, 
        name: true,
        leader: { select: { id: true } }
      }
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    const canView = 
      user.role === Role.SUPERADMIN ||
      user.role === Role.ADMIN ||
      group.leader?.id === user.id;

    if (!canView) {
      throw new ForbiddenException('No permission to view this group');
    }

    const dateObj = new Date(date);
    const worksheets = await this.prisma.workSheet.findMany({
      where: {
        groupId,
        date: {
          gte: new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()),
          lt: new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate() + 1),
        }
      },
      include: {
        worker: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true
          }
        },
        product: { select: { id: true, name: true } },
        process: { select: { id: true, name: true } },
        records: {
          include: {
            items: {
              include: {
                product: { select: { id: true, name: true } },
                process: { select: { id: true, name: true } }
              },
              orderBy: { entryIndex: 'asc' }
            }
          },
          orderBy: { workHour: 'asc' }
        },
        _count: {
          select: {
            records: { where: { status: WorkRecordStatus.COMPLETED } }
          }
        }
      },
      orderBy: {
        worker: { employeeCode: 'asc' }
      }
    });

    return worksheets.map(ws => {
      // ⭐ FIX: Calculate totalActual from items, not records
      const totalPlanned = ws.records.reduce((sum, r) => sum + (r.plannedOutput || 0), 0);
      const totalActual = ws.records.reduce((sum, r) => 
        sum + r.items.reduce((itemSum, item) => itemSum + (item.actualOutput || 0), 0), 0
      );
      const efficiency = totalPlanned > 0 ? Math.round((totalActual / totalPlanned) * 100) : 0;

      return {
        id: ws.id,
        worker: ws.worker,
        productId: ws.productId,
        processId: ws.processId,
        product: ws.product,
        process: ws.process,
        shiftType: ws.shiftType,
        plannedOutput: ws.plannedOutput,
        status: ws.status,
        completedRecords: ws._count.records,
        totalRecords: ws.records.length,
        totalPlanned,
        totalActual,
        efficiency,
        records: ws.records
      };
    });
  }

  /**
   * Archive old worksheets
   */
  async archiveOldWorksheets(beforeDate?: Date, user?: any) {
    // Only admin can archive
    if (user && user.role !== Role.SUPERADMIN && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Only admin can archive worksheets');
    }

    const archiveDate = beforeDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

    const worksheetsToArchive = await this.prisma.workSheet.count({
      where: {
        date: { lt: archiveDate },
        status: { not: WorkSheetStatus.ARCHIVED }
      }
    });

    if (worksheetsToArchive === 0) {
      return {
        message: 'No worksheets to archive',
        count: 0,
        archiveDate: archiveDate.toISOString()
      };
    }

    const result = await this.prisma.workSheet.updateMany({
      where: {
        date: { lt: archiveDate },
        status: { not: WorkSheetStatus.ARCHIVED }
      },
      data: { status: WorkSheetStatus.ARCHIVED }
    });

    return {
      message: 'Worksheets archived successfully',
      count: result.count,
      archiveDate: archiveDate.toISOString()
    };
  }

  /**
   * Quick update record (for mobile)
   */
  async quickUpdateRecord(
    worksheetId: string,
    recordId: string,
    actualOutput: number,
    user: any
  ) {
    const worksheet = await this.prisma.workSheet.findUnique({
      where: { id: worksheetId },
      include: {
        group: { select: { leaderId: true, leader: { select: { id: true } } } }
      }
    });

    if (!worksheet) {
      throw new NotFoundException('Worksheet not found');
    }

    // Check permissions
    const canUpdate = 
      user.role === Role.SUPERADMIN ||
      user.role === Role.ADMIN ||
      worksheet.group.leader?.id === user.id;

    if (!canUpdate) {
      throw new ForbiddenException('Only group leader can update records');
    }

    return this.prisma.workSheetRecord.update({
      where: { id: recordId },
      data: {
        actualOutput,
        status: WorkRecordStatus.COMPLETED,
        updatedById: user.id
      }
    });
  }

  /**
   * Get today production dashboard
   */
  async getTodayProductionDashboard(date: Date, user: any) {
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    const worksheets = await this.prisma.workSheet.findMany({
      where: {
        date: {
          gte: startOfDay,
          lt: endOfDay
        }
      },
      include: {
        office: { select: { id: true, name: true } },
        group: {
          select: {
            name: true,
            team: {
              select: {
                name: true,
                department: { select: { name: true } }
              }
            }
          }
        },
        records: {
          include: {
            items: true
          }
        }
      }
    });

    // Calculate metrics
    const totalWorksheets = worksheets.length;
    let totalPlanned = 0;
    let totalActual = 0;
    let completedRecords = 0;
    let totalRecords = 0;

    const officeStats = new Map<string, any>();

    worksheets.forEach(worksheet => {
      const officeId = worksheet.office.id;

      if (!officeStats.has(officeId)) {
        officeStats.set(officeId, {
          id: officeId,
          name: worksheet.office.name,
          totalWorksheets: 0,
          totalPlanned: 0,
          totalActual: 0,
          completedRecords: 0,
          totalRecords: 0
        });
      }

      const office = officeStats.get(officeId)!;
      office.totalWorksheets += 1;

      worksheet.records.forEach(record => {
        const recordPlanned = record.plannedOutput || 0;
        const recordActual = record.actualOutput || 0;

        totalPlanned += recordPlanned;
        totalActual += recordActual;
        totalRecords += 1;

        office.totalPlanned += recordPlanned;
        office.totalActual += recordActual;
        office.totalRecords += 1;

        if (record.status === WorkRecordStatus.COMPLETED) {
          completedRecords += 1;
          office.completedRecords += 1;
        }
      });
    });

    const overallEfficiency = totalPlanned > 0 ? 
      Math.round((totalActual / totalPlanned) * 100) : 0;

    return {
      summary: {
        date: date.toISOString().split('T')[0],
        totalWorksheets,
        totalPlanned,
        totalActual,
        overallEfficiency,
        completionRate: totalRecords > 0 ? 
          Math.round((completedRecords / totalRecords) * 100) : 0,
        activeOffices: officeStats.size
      },
      offices: Array.from(officeStats.values()).map(office => ({
        ...office,
        efficiency: office.totalPlanned > 0 ? 
          Math.round((office.totalActual / office.totalPlanned) * 100) : 0,
        completionRate: office.totalRecords > 0 ? 
          Math.round((office.completedRecords / office.totalRecords) * 100) : 0
      })),
      recentActivity: worksheets
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .slice(0, 10)
        .map(ws => ({
          id: ws.id,
          office: ws.office.name,
          group: ws.group.name,
          status: ws.status,
          updatedAt: ws.updatedAt
        }))
    };
  }

  /**
   * Get factory dashboard
   */
  async getFactoryDashboard(officeId: string, date: Date, user: any) {
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    const worksheets = await this.prisma.workSheet.findMany({
      where: {
        officeId,
        date: {
          gte: startOfDay,
          lt: endOfDay
        }
      },
      include: {
        office: { select: { name: true } },
        group: {
          include: {
            team: {
              include: {
                department: true
              }
            },
            leader: {
              select: { firstName: true, lastName: true, employeeCode: true }
            }
          }
        },
        worker: {
          select: { firstName: true, lastName: true, employeeCode: true }
        },
        records: {
          include: {
            items: {
              include: {
                product: { select: { id: true, name: true } },
                process: { select: { id: true, name: true } }
              }
            }
          },
          orderBy: { workHour: 'asc' }
        }
      }
    });

    // Group by group
    const groupMap = new Map<string, any>();

    worksheets.forEach(ws => {
      const groupId = ws.groupId;

      if (!groupMap.has(groupId)) {
        groupMap.set(groupId, {
          group: ws.group,
          worksheets: [],
          totalPlanned: 0,
          totalActual: 0,
          completedRecords: 0,
          totalRecords: 0
        });
      }

      const groupData = groupMap.get(groupId)!;
      groupData.worksheets.push(ws);

      ws.records.forEach(record => {
        groupData.totalPlanned += record.plannedOutput || 0;
        groupData.totalActual += record.actualOutput || 0;
        groupData.totalRecords += 1;

        if (record.status === WorkRecordStatus.COMPLETED) {
          groupData.completedRecords += 1;
        }
      });
    });

    return {
      office: worksheets[0]?.office || { name: 'Unknown', code: 'N/A' },
      date: date.toISOString().split('T')[0],
      groups: Array.from(groupMap.values()).map(groupData => ({
        group: {
          id: groupData.group.id,
          name: groupData.group.name,
          leader: groupData.group.leader
        },
        totalWorkers: groupData.worksheets.length,
        totalPlanned: groupData.totalPlanned,
        totalActual: groupData.totalActual,
        efficiency: groupData.totalPlanned > 0 ? 
          Math.round((groupData.totalActual / groupData.totalPlanned) * 100) : 0,
        completionRate: groupData.totalRecords > 0 ? 
          Math.round((groupData.completedRecords / groupData.totalRecords) * 100) : 0
      })),
      summary: {
        totalGroups: groupMap.size,
        totalWorkers: worksheets.length,
        totalPlanned: Array.from(groupMap.values()).reduce((sum, g) => sum + g.totalPlanned, 0),
        totalActual: Array.from(groupMap.values()).reduce((sum, g) => sum + g.totalActual, 0)
      }
    };
  }

  /**
   * Adjust record target (planned output)
   */
  async adjustRecordTarget(
    worksheetId: string,
    workHour: number,
    plannedOutput: number,
    user: any
  ) {
    const worksheet = await this.prisma.workSheet.findUnique({
      where: { id: worksheetId },
      include: {
        group: { select: { leaderId: true, leader: { select: { id: true } } } },
        records: { where: { workHour } }
      }
    });

    if (!worksheet) {
      throw new NotFoundException('Worksheet not found');
    }

    const record = worksheet.records[0];
    if (!record) {
      throw new NotFoundException(`Record not found for hour ${workHour}`);
    }

    // Check permissions
    const canUpdate = 
      user.role === Role.SUPERADMIN ||
      user.role === Role.ADMIN ||
      worksheet.group.leader?.id === user.id;

    if (!canUpdate) {
      throw new ForbiddenException('Only group leader can adjust targets');
    }

    return this.prisma.workSheetRecord.update({
      where: { id: record.id },
      data: { plannedOutput }
    });
  }

  /**
   * Copy forward product/process
   * Copy settings từ giờ này sang các giờ tiếp theo
   */
  async copyForwardProductProcess(
    worksheetId: string,
    fromHour: number,
    toHourStart: number,
    toHourEnd: number,
    user: any
  ) {
    const worksheet = await this.prisma.workSheet.findUnique({
      where: { id: worksheetId },
      include: {
        group: { select: { leaderId: true, leader: { select: { id: true } } } },
        records: {
          where: { workHour: fromHour },
          include: { items: true }
        }
      }
    });

    if (!worksheet) {
      throw new NotFoundException('Worksheet not found');
    }

    const sourceRecord = worksheet.records[0];
    if (!sourceRecord) {
      throw new NotFoundException(`Source record not found for hour ${fromHour}`);
    }

    // Check permissions
    const canUpdate = 
      user.role === Role.SUPERADMIN ||
      user.role === Role.ADMIN ||
      worksheet.group.leader?.id === user.id;

    if (!canUpdate) {
      throw new ForbiddenException('Only group leader can copy forward');
    }

    // Get target records
    const targetRecords = await this.prisma.workSheetRecord.findMany({
      where: {
        worksheetId,
        workHour: {
          gte: toHourStart,
          lte: toHourEnd
        }
      }
    });

    // Copy items to target hours
    await this.prisma.$transaction(async (tx) => {
      for (const targetRecord of targetRecords) {
        // Delete existing items
        await tx.workSheetRecordItem.deleteMany({
          where: { recordId: targetRecord.id }
        });

        // Copy items from source
        for (const sourceItem of sourceRecord.items) {
          await tx.workSheetRecordItem.create({
            data: {
              recordId: targetRecord.id,
              entryIndex: sourceItem.entryIndex,
              productId: sourceItem.productId,
              processId: sourceItem.processId,
              plannedOutput: sourceItem.plannedOutput,
              actualOutput: 0, // Reset actual output
              note: sourceItem.note
            }
          });
        }
      }
    });

    return {
      message: `Copied from hour ${fromHour} to hours ${toHourStart}-${toHourEnd}`,
      copiedRecords: targetRecords.length
    };
  }

  /**
   * Get realtime analytics
   */
  async getRealtimeAnalytics(filters: {
    factoryId?: string;
    date?: Date;
    userId?: string;
    userRole?: Role;
  }) {
    const dateObj = filters.date || new Date();
    const startOfDay = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    const where: any = {
      date: {
        gte: startOfDay,
        lt: endOfDay
      }
    };

    if (filters.factoryId) {
      where.factoryId = filters.factoryId;
    }

    // Role-based filtering
    if (filters.userRole === Role.USER && filters.userId) {
      const ledGroups = await this.prisma.group.findMany({
        where: { leaderId: filters.userId },
        select: { id: true }
      });

      if (ledGroups.length > 0) {
        where.groupId = { in: ledGroups.map(g => g.id) };
      } else {
        return {
          summary: {
            totalWorksheets: 0,
            totalWorkers: 0,
            totalPlanned: 0,
            totalActual: 0,
            overallEfficiency: 0,
            completionRate: 0
          },
          currentHour: new Date().getHours(),
          hourlyProgress: []
        };
      }
    }

    const worksheets = await this.prisma.workSheet.findMany({
      where,
      include: {
        records: {
          include: {
            items: true
          }
        }
      }
    });

    const currentHour = new Date().getHours();
    let totalPlanned = 0;
    let totalActual = 0;
    let completedRecords = 0;
    let totalRecords = 0;

    // Hourly progress
    const hourlyMap = new Map<number, any>();

    worksheets.forEach(ws => {
      ws.records.forEach(record => {
        const recordPlanned = record.plannedOutput || 0;
        const recordActual = record.actualOutput || 0;

        totalPlanned += recordPlanned;
        totalActual += recordActual;
        totalRecords += 1;

        if (record.status === WorkRecordStatus.COMPLETED) {
          completedRecords += 1;
        }

        // Group by work hour
        if (!hourlyMap.has(record.workHour)) {
          hourlyMap.set(record.workHour, {
            workHour: record.workHour,
            totalPlanned: 0,
            totalActual: 0,
            completedRecords: 0,
            totalRecords: 0,
            isCurrentHour: this.isCurrentWorkHour(record.workHour, currentHour)
          });
        }

        const hourData = hourlyMap.get(record.workHour)!;
        hourData.totalPlanned += recordPlanned;
        hourData.totalActual += recordActual;
        hourData.totalRecords += 1;

        if (record.status === WorkRecordStatus.COMPLETED) {
          hourData.completedRecords += 1;
        }
      });
    });

    const overallEfficiency = totalPlanned > 0 ? 
      Math.round((totalActual / totalPlanned) * 100) : 0;

    return {
      summary: {
        totalWorksheets: worksheets.length,
        totalPlanned,
        totalActual,
        overallEfficiency,
        completionRate: totalRecords > 0 ? 
          Math.round((completedRecords / totalRecords) * 100) : 0
      },
      currentHour,
      hourlyProgress: Array.from(hourlyMap.values())
        .sort((a, b) => a.workHour - b.workHour)
        .map(hour => ({
          ...hour,
          efficiency: hour.totalPlanned > 0 ? 
            Math.round((hour.totalActual / hour.totalPlanned) * 100) : 0,
          completionRate: hour.totalRecords > 0 ? 
            Math.round((hour.completedRecords / hour.totalRecords) * 100) : 0
        }))
    };
  }

  private isCurrentWorkHour(workHour: number, currentHour: number): boolean {
    const hourRanges = [
      { hour: 1, start: 7, end: 8 },
      { hour: 2, start: 8, end: 9 },
      { hour: 3, start: 9, end: 10 },
      { hour: 4, start: 10, end: 11 },
      { hour: 5, start: 12, end: 13 },
      { hour: 6, start: 13, end: 14 },
      { hour: 7, start: 14, end: 15 },
      { hour: 8, start: 15, end: 16 },
      { hour: 9, start: 16, end: 17 },
      { hour: 10, start: 17, end: 18 },
      { hour: 11, start: 18, end: 19 }
    ];

    const range = hourRanges.find(r => r.hour === workHour);
    if (!range) return false;

    return currentHour >= range.start && currentHour < range.end;
  }

  /**
   * Get worksheets for report export with organization hierarchy
   * Supports filtering by Factory → Line → Team → Group
   * 
   * @returns Detailed report data structure:
   * ```json
   * {
   *   "date": "2025-11-08",
   *   "summary": {
   *     "totalWorkers": 50,
   *     "totalWithWorksheet": 45,
   *     "totalWithoutWorksheet": 5,
   *     "totalPlanned": 14400,    // ⭐ SLKH tổng = SLKH/giờ × số giờ × số công nhân
   *     "totalActual": 13500,     // ⭐ SLTH tổng (sum of all items)
   *     "averageEfficiency": 94
   *   },
   *   "lines": [...],              // Hierarchical structure: Factory → Line → Team → Group → Workers
   *   "chartData": {
   *     "hourly": [                // ⭐ For Line Chart (performance by hour)
   *       { "workHour": 1, "totalPlanned": 1600, "totalActual": 1550, "efficiency": 97 },
   *       { "workHour": 2, "totalPlanned": 1600, "totalActual": 1520, "efficiency": 95 }
   *     ],
   *     "products": [              // ⭐ For Bar/Pie Chart (performance by product)
   *       {
   *         "product": { "id": "...", "name": "Product A", "code": "PA" },
   *         "process": { "id": "...", "name": "Process 1", "code": "P1" },
   *         "totalPlanned": 5000,
   *         "totalActual": 4800,
   *         "efficiency": 96
   *       }
   *     ],
   *     "lineComparison": [        // ⭐ For Bar Chart (line comparison)
   *       { "lineName": "Line 1", "lineCode": "L1", "totalPlanned": 7200, "totalActual": 6900, "efficiency": 96 }
   *     ]
   *   }
   * }
   * ```
   * 
   * Worker detail structure:
   * ```json
   * {
   *   "worker": { "id": "...", "employeeCode": "5001", "fullName": "Nguyen Van A" },
   *   "hasWorksheet": true,
   *   "totalHours": 8,                    // Số giờ làm việc thực tế
   *   "plannedOutputPerHour": 180,        // SLKH/giờ
   *   "totalPlanned": 1440,               // ⭐ = 180 × 8 giờ
   *   "totalActual": 1400,                // ⭐ Sum of items.actualOutput
   *   "efficiency": 97,
   *   "hourlyData": [...],                // Chi tiết theo giờ
   *   "productBreakdown": [...]           // Chi tiết theo sản phẩm
   * }
   * ```
   */
  async getWorksheetsForReport(filters: {
    date: Date;
    officeId?: string;
    departmentId?: string;
    teamId?: string;
    groupId?: string;
    userId?: string;
    userRole?: Role;
  }) {
    const dateObj = new Date(filters.date);
    
    // ⭐ FIX: Use local date without time component (date-only comparison)
    // Database stores date as DATE type (without timezone), so compare date strings
    const dateStr = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
    
    console.log('🔍 [REPORT DEBUG] Query params:', {
      inputDate: filters.date.toISOString(),
      queryDateStr: dateStr,
      officeId: filters.officeId,
      departmentId: filters.departmentId,
      teamId: filters.teamId,
      groupId: filters.groupId
    });

    // Build hierarchical filter - use date-only comparison
    const where: any = {
      date: new Date(dateStr)  // ⭐ Compare with date-only (no time)
    };

    // Apply filters based on hierarchy
    if (filters.groupId) {
      where.groupId = filters.groupId;
    } else if (filters.teamId) {
      where.group = {
        teamId: filters.teamId
      };
    } else if (filters.departmentId) {
      where.group = {
        team: {
          departmentId: filters.departmentId
        }
      };
    } else if (filters.officeId) {
      where.officeId = filters.officeId;
    }

    // Permission check for regular users (group leaders)
    if (filters.userRole === Role.USER && filters.userId) {
      const myGroups = await this.prisma.group.findMany({
        where: { leaderId: filters.userId },
        select: { id: true }
      });

      if (myGroups.length > 0) {
        where.groupId = { in: myGroups.map(g => g.id) };
      } else {
        return {
          date: dateObj.toISOString().split('T')[0],
          summary: {
            totalWorkers: 0,
            totalWithWorksheet: 0,
            totalWithoutWorksheet: 0,
            totalPlanned: 0,
            totalActual: 0,
            averageEfficiency: 0
          },
          lines: []
        };
      }
    }

    // Get all active workers in the filtered scope
    const workersQuery: any = {
      isActive: true
    };

    if (filters.groupId) {
      workersQuery.groupId = filters.groupId;
    } else if (filters.teamId) {
      workersQuery.group = { teamId: filters.teamId };
    } else if (filters.departmentId) {
      workersQuery.group = { team: { departmentId: filters.departmentId } };
    } else if (filters.officeId) {
      workersQuery.group = { team: { department: { officeId: filters.officeId } } };
    }

    const allWorkers = await this.prisma.user.findMany({
      where: workersQuery,
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        groupId: true,
        jobPosition: {
          select: {
            jobName: true,
            code: true,
            department: {
              select: {
                name: true
              }
            },
            position: {
              select: {
                name: true
              }
            }
          }
        },
        group: {
          select: {
            id: true,
            name: true,
            code: true,
            teamId: true,
            leaderId: true,
            leader: {
              select: {
                id: true,
                employeeCode: true,
                firstName: true,
                lastName: true
              }
            },
            team: {
              select: {
                id: true,
                name: true,
                code: true,
                departmentId: true,
                department: {
                  select: {
                    id: true,
                    name: true,
                    officeId: true,
                    office: {
                      select: {
                        id: true,
                        name: true
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });

    // Get worksheets with full relations
    const worksheets = await this.prisma.workSheet.findMany({
      where,
      include: {
        worker: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            jobPosition: {
              select: {
                jobName: true,
                code: true,
                department: {
                  select: {
                    name: true
                  }
                },
                position: {
                  select: {
                    name: true
                  }
                }
              }
            }
          }
        },
        group: {
          select: {
            id: true,
            name: true,
            code: true,
            leaderId: true,
            leader: {
              select: {
                id: true,
                employeeCode: true,
                firstName: true,
                lastName: true
              }
            },
            team: {
              select: {
                id: true,
                name: true,
                code: true,
                department: {
                  select: {
                    id: true,
                    name: true,
                    office: {
                      select: {
                        id: true,
                        name: true
                      }
                    }
                  }
                }
              }
            }
          }
        },
        product: {
          select: { id: true, name: true }
        },
        process: {
          select: { id: true, name: true }
        },
        records: {
          include: {
            items: {
              include: {
                product: { select: { id: true, name: true } },
                process: { select: { id: true, name: true } }
              },
              orderBy: { entryIndex: 'asc' }
            }
          },
          orderBy: { workHour: 'asc' }
        }
      },
      orderBy: [
        { group: { team: { department: { name: 'asc' } } } },
        { group: { team: { code: 'asc' } } },
        { group: { code: 'asc' } },
        { worker: { employeeCode: 'asc' } }
      ]
    });

    console.log('📊 [REPORT DEBUG] Worksheets found:', {
      count: worksheets.length,
      dates: worksheets.map(ws => ({
        id: ws.id.substring(0, 8),
        worker: ws.worker.employeeCode,
        date: ws.date.toISOString(),
        records: ws.records.length,
        items: ws.records.reduce((sum, r) => sum + r.items.length, 0)
      }))
    });

    // Create worker map for quick lookup
    const worksheetMap = new Map(worksheets.map(ws => [ws.workerId, ws]));

    // Build hierarchical structure: Department → Team → Group → Workers
    const departmentMap = new Map<string, any>();

    allWorkers.forEach((worker: any) => {
      if (!worker.group?.team?.department) return;

      const department = worker.group.team.department;
      const team = worker.group.team;
      const group = worker.group;

      // Initialize department
      if (!departmentMap.has(department.id)) {
        departmentMap.set(department.id, {
          department: {
            id: department.id,
            name: department.name,
            code: department.code,
            office: department.office
          },
          teams: new Map<string, any>()
        });
      }

      const departmentData = departmentMap.get(department.id)!;

      // Initialize team
      if (!departmentData.teams.has(team.id)) {
        departmentData.teams.set(team.id, {
          team: {
            id: team.id,
            name: team.name,
            code: team.code
          },
          groups: new Map<string, any>()
        });
      }

      const teamData = departmentData.teams.get(team.id)!;

      // Initialize group
      if (!teamData.groups.has(group.id)) {
        teamData.groups.set(group.id, {
          group: {
            id: group.id,
            name: group.name,
            code: group.code,
            leaderId: group.leader?.id,
            leaderName: group.leader ? `${group.leader.firstName} ${group.leader.lastName}` : 'N/A'
          },
          workers: []
        });
      }

      const groupData = teamData.groups.get(group.id)!;

      // Add worker data
      const worksheet = worksheetMap.get(worker.id);
      const hasWorksheet = !!worksheet;

      let totalActual = 0;
      const notes: string[] = [];
      const hourlyData: any[] = [];
      const productBreakdown = new Map<string, { product: any, process: any, planned: number, actual: number }>();

      if (worksheet) {
        worksheet.records.forEach(record => {
          // Skip totalPlanned calculation here - will calculate at end
          
          let hourActual = 0;
          const hourProducts: any[] = [];

          // ⭐ FIX: actualOutput from items (not from record.actualOutput)
          record.items.forEach(item => {
            const itemActual = item.actualOutput || 0;
            totalActual += itemActual;
            hourActual += itemActual;
            
            if (item.note) {
              notes.push(item.note);
            }

            // Track products
            hourProducts.push({
              product: item.product,
              process: item.process,
              actualOutput: itemActual
            });

            // Aggregate by product-process
            const key = `${item.productId}-${item.processId}`;
            if (!productBreakdown.has(key)) {
              productBreakdown.set(key, {
                product: item.product,
                process: item.process,
                planned: 0,
                actual: 0
              });
            }
            const pbData = productBreakdown.get(key)!;
            pbData.planned += record.plannedOutput || 0;
            pbData.actual += itemActual;
          });

          // Hourly data for charts
          hourlyData.push({
            workHour: record.workHour,
            startTime: record.startTime,
            endTime: record.endTime,
            plannedOutput: record.plannedOutput || 0, // ⭐ SLKH for this specific hour (may vary per hour)
            actualOutput: hourActual,
            efficiency: record.plannedOutput > 0 ? Math.round((hourActual / record.plannedOutput) * 100) : 0,
            status: record.status,
            products: hourProducts
          });
        });
      }

      // ⭐ FIX: Calculate totalPlanned with hour duration coefficient
      // Sum record.plannedOutput across all hours (already includes 1.5x for hour 9)
      const totalHours = worksheet?.records.length || 0;
      const plannedOutputPerHour = worksheet?.plannedOutput || 0;
      
      // ⭐ CORRECT: Sum record.plannedOutput with hour coefficient applied
      // For EXTENDED_9_5H: 8 hours × 10 + 1 hour × 10 × 1.5 = 80 + 15 = 95
      let totalPlanned = 0;
      if (worksheet) {
        totalPlanned = worksheet.records.reduce((sum, record) => {
          // Apply hour duration coefficient (1.5x for hour 9 in EXTENDED_9_5H)
          const hourCoefficient = (worksheet.shiftType === 'EXTENDED_9_5H' && record.workHour === 9) ? 1.5 : 1;
          const plannedForHour = (record.plannedOutput || worksheet.plannedOutput) * hourCoefficient;
          return sum + plannedForHour;
        }, 0);
      }

      // ⭐ FIX: Efficiency = SLTH / SLKH (actualOutput / plannedOutput)
      const efficiency = totalPlanned > 0 ? Math.round((totalActual / totalPlanned) * 100) : 0;

      groupData.workers.push({
        worker: {
          id: worker.id,
          employeeCode: worker.employeeCode,
          fullName: `${worker.firstName} ${worker.lastName}`,
          jobPosition: worker.jobPosition?.jobName || 'N/A',
          jobCode: worker.jobPosition?.code || 'N/A',
          position: worker.jobPosition?.position?.name || 'N/A',
          department: worker.jobPosition?.department?.name || 'N/A'
        },
        hasWorksheet,
        worksheetId: worksheet?.id,
        shiftType: worksheet?.shiftType,
        status: worksheet?.status,
        
        // ⭐ Summary metrics
        totalHours,                    // Số giờ làm việc thực tế
        plannedOutputPerHour: worksheet?.plannedOutput || 0,  // SLKH/giờ (e.g., 90)
        totalPlanned,                  // ⭐ FIXED: SLKH tổng = SLKH/giờ × số giờ (e.g., 90 × 9.5 = 855)
        totalActual,                   // ⭐ SLTH tổng (sum of items.actualOutput)
        efficiency,
        notes: notes.join('; '),
        
        // ⭐ Detailed breakdowns for Excel & Charts
        hourlyData,                    // Chi tiết theo giờ (for line chart)
        productBreakdown: Array.from(productBreakdown.values())  // Chi tiết theo sản phẩm (for bar chart)
      });
    });

    // Convert to array structure for response
    const departments = Array.from(departmentMap.values()).map((departmentData: any) => ({
      department: departmentData.department,
      teams: Array.from(departmentData.teams.values()).map((teamData: any) => ({
        team: teamData.team,
        groups: Array.from(teamData.groups.values()).map((groupData: any) => {
          // ⭐ Calculate group-level aggregations for charts
          const groupSummary = {
            totalWorkers: groupData.workers.length,
            totalWithWorksheet: groupData.workers.filter((w: any) => w.hasWorksheet).length,
            totalWithoutWorksheet: groupData.workers.filter((w: any) => !w.hasWorksheet).length,
            totalPlanned: groupData.workers.reduce((sum: number, w: any) => sum + w.totalPlanned, 0),
            totalActual: groupData.workers.reduce((sum: number, w: any) => sum + w.totalActual, 0),
            averageEfficiency: 0
          };

          const totalPlanned = groupSummary.totalPlanned;
          const totalActual = groupSummary.totalActual;
          groupSummary.averageEfficiency = totalPlanned > 0 ? Math.round((totalActual / totalPlanned) * 100) : 0;

          // ⭐ Hourly aggregation for group (for line chart)
          const groupHourlyMap = new Map<number, { hour: number, planned: number, actual: number, workers: number }>();
          groupData.workers.forEach((w: any) => {
            if (w.hourlyData) {
              w.hourlyData.forEach((h: any) => {
                if (!groupHourlyMap.has(h.workHour)) {
                  groupHourlyMap.set(h.workHour, { hour: h.workHour, planned: 0, actual: 0, workers: 0 });
                }
                const hourData = groupHourlyMap.get(h.workHour)!;
                // ⭐ For group hourly: Use actual plannedOutput from record (not recalculated)
                hourData.planned += h.plannedOutput;
                hourData.actual += h.actualOutput;
                hourData.workers += 1;
              });
            }
          });

          const groupHourlyData = Array.from(groupHourlyMap.values())
            .sort((a, b) => a.hour - b.hour)
            .map(h => ({
              workHour: h.hour,
              totalPlanned: h.planned,
              totalActual: h.actual,
              activeWorkers: h.workers,
              efficiency: h.planned > 0 ? Math.round((h.actual / h.planned) * 100) : 0
            }));

          // ⭐ Product breakdown for group (for bar/pie chart)
          const groupProductMap = new Map<string, { product: any, process: any, planned: number, actual: number }>();
          groupData.workers.forEach((w: any) => {
            if (w.productBreakdown) {
              w.productBreakdown.forEach((pb: any) => {
                const key = `${pb.product.id}-${pb.process.id}`;
                if (!groupProductMap.has(key)) {
                  groupProductMap.set(key, {
                    product: pb.product,
                    process: pb.process,
                    planned: 0,
                    actual: 0
                  });
                }
                const prodData = groupProductMap.get(key)!;
                prodData.planned += pb.planned;
                prodData.actual += pb.actual;
              });
            }
          });

          const groupProductBreakdown = Array.from(groupProductMap.values()).map(p => ({
            product: p.product,
            process: p.process,
            totalPlanned: p.planned,
            totalActual: p.actual,
            efficiency: p.planned > 0 ? Math.round((p.actual / p.planned) * 100) : 0
          }));

          return {
            group: groupData.group,
            workers: groupData.workers,
            summary: groupSummary,
            // ⭐ Chart data
            chartData: {
              hourly: groupHourlyData,           // For line chart: performance by hour
              products: groupProductBreakdown,   // For bar/pie chart: performance by product
              workerComparison: groupData.workers
                .filter((w: any) => w.hasWorksheet)
                .map((w: any) => ({
                  workerCode: w.worker.employeeCode,
                  workerName: w.worker.fullName,
                  totalPlanned: w.totalPlanned,
                  totalActual: w.totalActual,
                  efficiency: w.efficiency
                }))  // For bar chart: worker comparison
            }
          };
        })
      }))
    }));

    // Calculate overall summary
    const totalWorkers = allWorkers.length;
    const totalWithWorksheet = worksheets.length;
    const totalWithoutWorksheet = totalWorkers - totalWithWorksheet;
    
    // ⭐ FIX: Calculate totalPlanned with hour duration coefficient
    let totalPlanned = 0;
    let totalActual = 0;
    
    worksheets.forEach(ws => {
      // ⭐ Sum record.plannedOutput with hour coefficient (1.5x for hour 9 in EXTENDED_9_5H)
      ws.records.forEach(r => {
        const hourCoefficient = (ws.shiftType === 'EXTENDED_9_5H' && r.workHour === 9) ? 1.5 : 1;
        const plannedForHour = (r.plannedOutput || ws.plannedOutput) * hourCoefficient;
        totalPlanned += plannedForHour;
        
        // ⭐ Sum actualOutput from items
        r.items.forEach(item => {
          totalActual += item.actualOutput || 0;
        });
      });
    });
    
    const averageEfficiency = totalPlanned > 0 ? Math.round((totalActual / totalPlanned) * 100) : 0;

    // ⭐ Overall chart data aggregations
    const overallHourlyMap = new Map<number, { hour: number, planned: number, actual: number }>();
    const overallProductMap = new Map<string, { product: any, process: any, planned: number, actual: number }>();

    worksheets.forEach(ws => {
      ws.records.forEach(r => {
        // Hourly aggregation
        if (!overallHourlyMap.has(r.workHour)) {
          overallHourlyMap.set(r.workHour, { hour: r.workHour, planned: 0, actual: 0 });
        }
        const hourData = overallHourlyMap.get(r.workHour)!;
        hourData.planned += r.plannedOutput || 0;

        r.items.forEach(item => {
          const itemActual = item.actualOutput || 0;
          hourData.actual += itemActual;

          // Product aggregation
          const key = `${item.productId}-${item.processId}`;
          if (!overallProductMap.has(key)) {
            overallProductMap.set(key, {
              product: item.product,
              process: item.process,
              planned: 0,
              actual: 0
            });
          }
          const prodData = overallProductMap.get(key)!;
          prodData.planned += r.plannedOutput || 0;
          prodData.actual += itemActual;
        });
      });
    });

    const overallHourlyData = Array.from(overallHourlyMap.values())
      .sort((a, b) => a.hour - b.hour)
      .map(h => ({
        workHour: h.hour,
        totalPlanned: h.planned,
        totalActual: h.actual,
        efficiency: h.planned > 0 ? Math.round((h.actual / h.planned) * 100) : 0
      }));

    const overallProductData = Array.from(overallProductMap.values()).map(p => ({
      product: p.product,
      process: p.process,
      totalPlanned: p.planned,
      totalActual: p.actual,
      efficiency: p.planned > 0 ? Math.round((p.actual / p.planned) * 100) : 0
    }));


    return {
      date: dateObj.toISOString().split('T')[0],
      summary: {
        totalWorkers,
        totalWithWorksheet,
        totalWithoutWorksheet,
        totalPlanned,
        totalActual,
        averageEfficiency

      },
      departments,
      // ⭐ Overall chart data for dashboard
      chartData: {
        hourly: overallHourlyData,        // Overall performance by hour
        products: overallProductData,     // Overall performance by product
        departmentComparison: departments.map((dept: any) => ({
          departmentName: dept.department.name,
          departmentCode: dept.department.code,
          totalPlanned: dept.teams.reduce((sum: number, t: any) => 
            sum + t.groups.reduce((gSum: number, g: any) => gSum + g.summary.totalPlanned, 0), 0
          ),
          totalActual: dept.teams.reduce((sum: number, t: any) => 
            sum + t.groups.reduce((gSum: number, g: any) => gSum + g.summary.totalActual, 0), 0
          ),
          efficiency: 0  // Will calculate below
        }))
      }
    };
  }
}
