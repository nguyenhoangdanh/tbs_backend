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
    let factoryId: string;
    let finalGroupId: string;

    if (groupId) {
      // Get group with members and factory info
      group = await this.prisma.group.findUnique({
        where: { id: groupId },
        include: {
          team: {
            include: {
              line: {
                include: { factory: true }
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

      if (!group.team?.line?.factory) {
        throw new BadRequestException('Group must belong to a factory');
      }

      workers = group.members;
      factoryId = group.team.line.factory.id;
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
                  line: {
                    include: { factory: true }
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

      // Use first worker's factory and group
      const firstWorker = workers[0];
      if (!firstWorker.group?.team?.line?.factory) {
        throw new BadRequestException('Workers must belong to a factory');
      }

      if (!firstWorker.groupId) {
        throw new BadRequestException('Workers must belong to a group');
      }

      factoryId = firstWorker.group.team.line.factory.id;
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
            factoryId,
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
      select: { id: true, leaderId: true, name: true }
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    const canUpdate = 
      user.role === Role.SUPERADMIN ||
      user.role === Role.ADMIN ||
      group.leaderId === user.id;

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
        let entryIndex = 1;

        for (const entry of output.entries) {
          await tx.workSheetRecordItem.create({
            data: {
              recordId: record.id,
              entryIndex: entryIndex++,
              productId: entry.productId,
              processId: entry.processId,
              actualOutput: entry.actualOutput,
              plannedOutput: worksheet.plannedOutput,
              note: entry.note
            }
          });

          totalActual += entry.actualOutput;
        }

        // Update record totals
        const updated = await tx.workSheetRecord.update({
          where: { id: record.id },
          data: {
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
      select: { leaderId: true, name: true }
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    const canView = 
      user.role === Role.SUPERADMIN ||
      user.role === Role.ADMIN ||
      group.leaderId === user.id;

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
        product: { select: { name: true, code: true } },
        process: { select: { name: true, code: true } },
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
        plannedOutput: record.plannedOutput,
        actualOutput: record.actualOutput,
        status: record.status,
        items: record.items.map(item => ({
          entryIndex: item.entryIndex,
          product: {
            id: item.productId,  // ⭐ ADD: productId for frontend
            ...item.product
          },
          process: {
            id: item.processId,  // ⭐ ADD: processId for frontend
            ...item.process
          },
          actualOutput: item.actualOutput,
          note: item.note
        }))
      }));

      // ⭐ FIX: Calculate from items, not records
      const totalPlanned = ws.records.reduce((sum, r) => sum + (r.plannedOutput || 0), 0);
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
      { hour: 5, startTime: '12:30', endTime: '13:30' },
      { hour: 6, startTime: '13:30', endTime: '14:30' },
      { hour: 7, startTime: '14:30', endTime: '15:30' },
      { hour: 8, startTime: '15:30', endTime: '16:30' }
    ];

    switch (shiftType) {
      case ShiftType.EXTENDED_9_5H:
        return [
          ...baseHours,
          { hour: 9, startTime: '16:30', endTime: '17:00' }
        ];
      case ShiftType.OVERTIME_11H:
        return [
          ...baseHours,
          { hour: 9, startTime: '16:30', endTime: '17:30' },
          { hour: 10, startTime: '17:30', endTime: '18:30' },
          { hour: 11, startTime: '18:30', endTime: '19:30' }
        ];
      default:
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
    date?: Date;
    status?: string;
    userId?: string;
    userRole?: Role;
  }) {
    const where: any = {};

    if (filters.factoryId) {
      where.factoryId = filters.factoryId;
    }

    if (filters.groupId) {
      where.groupId = filters.groupId;
    }

    if (filters.date) {
      const dateObj = new Date(filters.date);
      where.date = {
        gte: new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()),
        lt: new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate() + 1),
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
        factory: { select: { name: true, code: true } },
        group: {
          select: {
            name: true,
            code: true,
            team: {
              select: {
                name: true,
                line: { select: { name: true } }
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

    return worksheets.map(ws => ({
      id: ws.id,
      date: ws.date.toISOString().split('T')[0],
      worker: ws.worker,
      group: ws.group,
      factory: ws.factory,
      product: ws.product,
      process: ws.process,
      shiftType: ws.shiftType,
      plannedOutput: ws.plannedOutput,
      status: ws.status,
      completedRecords: ws._count.records,
      createdBy: ws.createdBy,
      createdAt: ws.createdAt,
      updatedAt: ws.updatedAt
    }));
  }

  /**
   * Find one worksheet by ID
   */
  async findOne(id: string, user: any) {
    const worksheet = await this.prisma.workSheet.findUnique({
      where: { id },
      include: {
        factory: { select: { name: true, code: true } },
        group: {
          include: {
            team: {
              include: {
                line: { select: { name: true } }
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
      worksheet.group.leaderId === user.id ||
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
   */
  async update(id: string, updateDto: UpdateWorksheetDto, user: any) {
    const worksheet = await this.prisma.workSheet.findUnique({
      where: { id },
      include: { group: { select: { leaderId: true } } }
    });

    if (!worksheet) {
      throw new NotFoundException('Worksheet not found');
    }

    // Check permissions
    const canUpdate = 
      user.role === Role.SUPERADMIN ||
      user.role === Role.ADMIN ||
      worksheet.createdById === user.id;

    if (!canUpdate) {
      throw new ForbiddenException('No permission to update this worksheet');
    }

    return this.prisma.workSheet.update({
      where: { id },
      data: updateDto,
      include: {
        factory: { select: { name: true, code: true } },
        group: { select: { name: true } },
        worker: { select: { firstName: true, lastName: true } },
        product: { select: { name: true, code: true } },
        process: { select: { name: true, code: true } }
      }
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
        group: { select: { leaderId: true } },
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
      worksheet.group.leaderId === user.id;

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
      include: { group: { select: { leaderId: true } } }
    });

    if (!worksheet) {
      throw new NotFoundException('Worksheet not found');
    }

    // Check permissions
    const canComplete = 
      user.role === Role.SUPERADMIN ||
      user.role === Role.ADMIN ||
      worksheet.group.leaderId === user.id;

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
        factory: { select: { name: true, code: true } },
        group: { select: { name: true, code: true } },
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
        factory: ws.factory,
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
        group: { select: { leaderId: true } },
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
      worksheet.group.leaderId === user.id;

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
      select: { leaderId: true, name: true }
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    const canView = 
      user.role === Role.SUPERADMIN ||
      user.role === Role.ADMIN ||
      group.leaderId === user.id;

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
        product: { select: { name: true, code: true } },
        process: { select: { name: true, code: true } },
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
        group: { select: { leaderId: true } }
      }
    });

    if (!worksheet) {
      throw new NotFoundException('Worksheet not found');
    }

    // Check permissions
    const canUpdate = 
      user.role === Role.SUPERADMIN ||
      user.role === Role.ADMIN ||
      worksheet.group.leaderId === user.id;

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
        factory: { select: { id: true, name: true, code: true } },
        group: {
          select: {
            name: true,
            team: {
              select: {
                name: true,
                line: { select: { name: true } }
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

    const factoryStats = new Map<string, any>();

    worksheets.forEach(worksheet => {
      const factoryId = worksheet.factory.id;

      if (!factoryStats.has(factoryId)) {
        factoryStats.set(factoryId, {
          id: factoryId,
          name: worksheet.factory.name,
          code: worksheet.factory.code,
          totalWorksheets: 0,
          totalPlanned: 0,
          totalActual: 0,
          completedRecords: 0,
          totalRecords: 0
        });
      }

      const factory = factoryStats.get(factoryId)!;
      factory.totalWorksheets += 1;

      worksheet.records.forEach(record => {
        const recordPlanned = record.plannedOutput || 0;
        const recordActual = record.actualOutput || 0;

        totalPlanned += recordPlanned;
        totalActual += recordActual;
        totalRecords += 1;

        factory.totalPlanned += recordPlanned;
        factory.totalActual += recordActual;
        factory.totalRecords += 1;

        if (record.status === WorkRecordStatus.COMPLETED) {
          completedRecords += 1;
          factory.completedRecords += 1;
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
        activeFactories: factoryStats.size
      },
      factories: Array.from(factoryStats.values()).map(factory => ({
        ...factory,
        efficiency: factory.totalPlanned > 0 ? 
          Math.round((factory.totalActual / factory.totalPlanned) * 100) : 0,
        completionRate: factory.totalRecords > 0 ? 
          Math.round((factory.completedRecords / factory.totalRecords) * 100) : 0
      })),
      recentActivity: worksheets
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .slice(0, 10)
        .map(ws => ({
          id: ws.id,
          factory: ws.factory.name,
          group: ws.group.name,
          status: ws.status,
          updatedAt: ws.updatedAt
        }))
    };
  }

  /**
   * Get factory dashboard
   */
  async getFactoryDashboard(factoryId: string, date: Date, user: any) {
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    const worksheets = await this.prisma.workSheet.findMany({
      where: {
        factoryId,
        date: {
          gte: startOfDay,
          lt: endOfDay
        }
      },
      include: {
        factory: { select: { name: true, code: true } },
        group: {
          include: {
            team: {
              include: {
                line: true
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
                product: { select: { id: true, name: true, code: true } },
                process: { select: { id: true, name: true, code: true } }
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
      factory: worksheets[0]?.factory || { name: 'Unknown', code: 'N/A' },
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
        group: { select: { leaderId: true } },
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
      worksheet.group.leaderId === user.id;

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
        group: { select: { leaderId: true } },
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
      worksheet.group.leaderId === user.id;

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
    factoryId?: string;
    lineId?: string;
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
      factoryId: filters.factoryId,
      lineId: filters.lineId,
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
    } else if (filters.lineId) {
      where.group = {
        team: {
          lineId: filters.lineId
        }
      };
    } else if (filters.factoryId) {
      where.factoryId = filters.factoryId;
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
    } else if (filters.lineId) {
      workersQuery.group = { team: { lineId: filters.lineId } };
    } else if (filters.factoryId) {
      workersQuery.group = { team: { line: { factoryId: filters.factoryId } } };
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
            team: {
              select: {
                id: true,
                name: true,
                code: true,
                lineId: true,
                line: {
                  select: {
                    id: true,
                    name: true,
                    code: true,
                    factoryId: true,
                    factory: {
                      select: {
                        id: true,
                        name: true,
                        code: true
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
            team: {
              select: {
                id: true,
                name: true,
                code: true,
                line: {
                  select: {
                    id: true,
                    name: true,
                    code: true,
                    factory: {
                      select: {
                        id: true,
                        name: true,
                        code: true
                      }
                    }
                  }
                }
              }
            }
          }
        },
        product: {
          select: { id: true, name: true, code: true }
        },
        process: {
          select: { id: true, name: true, code: true }
        },
        records: {
          include: {
            items: {
              include: {
                product: { select: { id: true, name: true, code: true } },
                process: { select: { id: true, name: true, code: true } }
              },
              orderBy: { entryIndex: 'asc' }
            }
          },
          orderBy: { workHour: 'asc' }
        }
      },
      orderBy: [
        { group: { team: { line: { code: 'asc' } } } },
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

    console.log('🗺️ [REPORT DEBUG] Worker-Worksheet mapping:', {
      totalWorkers: allWorkers.length,
      totalWorksheets: worksheets.length,
      mappedWorkerIds: Array.from(worksheetMap.keys()),
      allWorkerIds: allWorkers.map(w => w.id)
    });

    // Build hierarchical structure: Line → Team → Group → Workers
    const lineMap = new Map<string, any>();

    allWorkers.forEach(worker => {
      if (!worker.group?.team?.line) return;

      const line = worker.group.team.line;
      const team = worker.group.team;
      const group = worker.group;

      // Initialize line
      if (!lineMap.has(line.id)) {
        lineMap.set(line.id, {
          line: {
            id: line.id,
            name: line.name,
            code: line.code,
            factory: line.factory
          },
          teams: new Map<string, any>()
        });
      }

      const lineData = lineMap.get(line.id)!;

      // Initialize team
      if (!lineData.teams.has(team.id)) {
        lineData.teams.set(team.id, {
          team: {
            id: team.id,
            name: team.name,
            code: team.code
          },
          groups: new Map<string, any>()
        });
      }

      const teamData = lineData.teams.get(team.id)!;

      // Initialize group
      if (!teamData.groups.has(group.id)) {
        teamData.groups.set(group.id, {
          group: {
            id: group.id,
            name: group.name,
            code: group.code
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

      // ⭐ FIX: Calculate totalPlanned = plannedOutputPerHour × totalHours
      const totalHours = worksheet?.records.length || 0;
      const plannedOutputPerHour = worksheet?.plannedOutput || 0;
      
      // ⭐ OPTION 1: Use record count (current - may be inaccurate for 9.5h shift with 9 records)
      // const totalPlanned = plannedOutputPerHour * totalHours;
      
      // ⭐ OPTION 2: Use shiftType for exact hours
      const getShiftHours = (shiftType: string) => {
        switch (shiftType) {
          case 'NORMAL_8H': return 8;
          case 'EXTENDED_9_5H': return 9.5;
          case 'OVERTIME_11H': return 11;
          default: return totalHours; // Fallback to record count
        }
      };
      
      const exactHours = worksheet ? getShiftHours(worksheet.shiftType) : totalHours;
      const totalPlanned = plannedOutputPerHour * exactHours; // ⭐ CORRECT: 90 × 9.5 = 855

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
    const lines = Array.from(lineMap.values()).map((lineData: any) => ({
      line: lineData.line,
      teams: Array.from(lineData.teams.values()).map((teamData: any) => ({
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
    
    // ⭐ FIX: Calculate totalPlanned correctly for all worksheets
    let totalPlanned = 0;
    let totalActual = 0;
    
    const getShiftHours = (shiftType: string) => {
      switch (shiftType) {
        case 'NORMAL_8H': return 8;
        case 'EXTENDED_9_5H': return 9.5;
        case 'OVERTIME_11H': return 11;
        default: return 0;
      }
    };
    
    worksheets.forEach(ws => {
      // ⭐ CRITICAL: totalPlanned = plannedOutputPerHour × exact shift hours
      const exactHours = getShiftHours(ws.shiftType);
      const worksheetTotalPlanned = (ws.plannedOutput || 0) * exactHours;
      totalPlanned += worksheetTotalPlanned;
      
      // ⭐ CRITICAL: Sum actualOutput from items
      ws.records.forEach(r => {
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

    console.log('✅ [REPORT DEBUG] Final summary:', {
      totalWorkers,
      totalWithWorksheet,
      totalWithoutWorksheet,
      totalPlanned,
      totalActual,
      averageEfficiency,
      linesCount: lines.length
    });

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
      lines,
      // ⭐ Overall chart data for dashboard
      chartData: {
        hourly: overallHourlyData,        // Overall performance by hour
        products: overallProductData,     // Overall performance by product
        lineComparison: lines.map((line: any) => ({
          lineName: line.line.name,
          lineCode: line.line.code,
          totalPlanned: line.teams.reduce((sum: number, t: any) => 
            sum + t.groups.reduce((gSum: number, g: any) => gSum + g.summary.totalPlanned, 0), 0
          ),
          totalActual: line.teams.reduce((sum: number, t: any) => 
            sum + t.groups.reduce((gSum: number, g: any) => gSum + g.summary.totalActual, 0), 0
          ),
          efficiency: 0  // Will calculate below
        }))
      }
    };
  }
}
