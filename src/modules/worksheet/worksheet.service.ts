import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { CreateWorksheetDto } from './dto/create-worksheet.dto';
import { Role, WorkSheetStatus, WorkRecordStatus, ShiftType } from '@prisma/client';
import { UpdateWorksheetRecordDto } from './dto/update-worksheet-record.dto';
import { BatchUpdateRecordsDto } from './dto/batch-update-records.dto';
import { UpdateWorksheetDto } from './dto/update-worksheet.dto';
import { QuickUpdateRecordDto } from './dto/quick-update-record.dto';
import { 
  transformWorksheet, 
  transformWorksheets, 
  transformWorksheetRecord,
  transformWorksheetRecords 
} from '../../common/utils/time-serialization';

@Injectable()
export class WorksheetService {
  constructor(private prisma: PrismaService) {}

  async createWorksheet(createWorksheetDto: CreateWorksheetDto, createdById: string) {
    const { groupId, date, shiftType, productId, processId } = createWorksheetDto;

    // Validate group exists and get group info with factory
    const group = await this.prisma.group.findUnique({
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
          // where: { isActive: true, role: Role.WORKER },
          where: { isActive: true },
          select: { id: true, employeeCode: true, firstName: true, lastName: true }
        }
      }
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    if (!group.team?.line?.factory) {
      throw new BadRequestException('Group must belong to a valid factory structure');
    }

    // Check if worksheet already exists for this group and date
    const existingWorksheet = await this.prisma.workSheet.findUnique({
      where: {
        date_groupId: { date: new Date(date), groupId }
      }
    });

    if (existingWorksheet) {
      throw new ConflictException('Worksheet already exists for this group and date');
    }

    // Validate product-process combination
    const productProcess = await this.prisma.productProcess.findUnique({
      where: {
        productId_processId: { productId, processId }
      },
      include: {
        product: { select: { name: true, code: true } },
        process: { select: { name: true, code: true } }
      }
    });

    if (!productProcess) {
      throw new BadRequestException('Invalid product-process combination');
    }

    const totalWorkers = group.members.length;
    if (totalWorkers === 0) {
      throw new BadRequestException('Group has no active workers');
    }

    // Calculate target output per hour for the group
    // standardOutputPerHour represents output per individual worker per hour
    // Use override if provided, otherwise calculate group target = standardOutputPerHour * totalWorkers
    const targetOutputPerHour = createWorksheetDto.targetOutputPerHour || Math.round(
      productProcess.standardOutputPerHour * totalWorkers
    );

    // Create worksheet with transaction
    const worksheet = await this.prisma.$transaction(async (tx) => {
      // Create main worksheet
      const newWorksheet = await tx.workSheet.create({
        data: {
          date: new Date(date),
          factoryId: group.team.line.factory.id,
          groupId,
          shiftType,
          totalWorkers,
          targetOutputPerHour,
          createdById,
          status: WorkSheetStatus.ACTIVE,
        },
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
          createdBy: { select: { firstName: true, lastName: true, employeeCode: true } }
        }
      });

      // Create worksheet items for each worker with individual targets
      const worksheetItems = await Promise.all(
        group.members.map(worker =>
          tx.workSheetItem.create({
            data: {
              worksheetId: newWorksheet.id,
              workerId: worker.id,
              productId,
              processId,
              targetOutputPerHour: productProcess.standardOutputPerHour, // Individual target per worker
            }
          })
        )
      );

      // Create worksheet records for each hour based on shift type
      const workHours = this.getWorkHoursWithDate(shiftType, new Date(date));
      const worksheetRecords = await Promise.all(
        workHours.map(({ hour, startTime, endTime }) =>
          tx.workSheetRecord.create({
            data: {
              worksheetId: newWorksheet.id,
              workHour: hour,
              startTime,
              endTime,
              status: WorkRecordStatus.PENDING,
            }
          })
        )
      );

      return transformWorksheet({ ...newWorksheet, items: worksheetItems, records: worksheetRecords });
    });

    return transformWorksheet({
      ...worksheet,
      summary: {
        totalWorkers,
        totalHours: this.getWorkHoursForShift(shiftType).length,
        targetOutputPerHour,
        productProcess: {
          product: productProcess.product,
          process: productProcess.process,
          standardOutput: productProcess.standardOutputPerHour
        }
      }
    });
  }

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
      where.date = filters.date;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    // Apply role-based filtering
    if (filters.userRole === Role.USER) {
      // Regular users can only see worksheets they created
      where.createdById = filters.userId;
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
        createdBy: { select: { firstName: true, lastName: true, employeeCode: true } },
        _count: {
          select: {
            items: true,
            records: { where: { status: WorkRecordStatus.COMPLETED } }
          }
        }
      },
      orderBy: [
        { date: 'desc' },
        { createdAt: 'desc' }
      ]
    });

    return transformWorksheets(worksheets);
  }

  async findAllPaginated(filters: {
    factoryId?: string;
    groupId?: string;
    date?: Date;
    status?: string;
    userId?: string;
    userRole?: Role;
    page?: number;
    limit?: number;
  }) {
    const { page = 1, limit = 10, ...filterOptions } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (filterOptions.factoryId) {
      where.factoryId = filterOptions.factoryId;
    }

    if (filterOptions.groupId) {
      where.groupId = filterOptions.groupId;
    }

    if (filterOptions.date) {
      where.date = filterOptions.date;
    }

    if (filterOptions.status) {
      where.status = filterOptions.status;
    }

    // Apply role-based filtering
    if (filterOptions.userRole === Role.USER) {
      where.createdById = filterOptions.userId;
    }

    const [worksheets, total] = await Promise.all([
      this.prisma.workSheet.findMany({
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
          createdBy: { select: { firstName: true, lastName: true, employeeCode: true } },
          _count: {
            select: {
              items: true,
              records: { where: { status: WorkRecordStatus.COMPLETED } }
            }
          }
        },
        orderBy: [
          { date: 'desc' },
          { createdAt: 'desc' }
        ],
        skip,
        take: limit,
      }),
      this.prisma.workSheet.count({ where }),
    ]);

    return {
      data: worksheets,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getGroupWorksheets(groupId: string, date: Date, user: any) {
    // Check if user has access to this group
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      select: {
        id: true,
        name: true,
        leaderId: true,
        team: {
          select: {
            line: {
              select: {
                factory: { select: { id: true, name: true } }
              }
            }
          }
        }
      }
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    // Check permissions
    const canAccess = 
      user.role === Role.SUPERADMIN ||
      user.role === Role.ADMIN ||
      group.leaderId === user.id;

    if (!canAccess) {
      throw new ForbiddenException('You do not have access to this group');
    }

    const worksheets = await this.prisma.workSheet.findMany({
      where: {
        groupId,
        date: {
          gte: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
          lt: new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1),
        }
      },
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
        items: {
          include: {
            worker: { select: { firstName: true, lastName: true, employeeCode: true } },
            product: { select: { name: true, code: true } },
            process: { select: { name: true, code: true } },
            _count: {
              select: { records: { where: { actualOutput: { gt: 0 } } } }
            }
          }
        },
        records: {
          include: {
            _count: {
              select: {
                itemRecords: { where: { actualOutput: { gt: 0 } } }
              }
            }
          },
          orderBy: { workHour: 'asc' }
        }
      }
    });

    return transformWorksheets(worksheets);
  }

  async getMyGroupWorksheets(userId: string, date: Date) {
    // Find groups where user is the leader
    const myGroups = await this.prisma.group.findMany({
      where: { leaderId: userId },
      select: { id: true }
    });

    console.log('My Groups:', myGroups);

    const groupIds = myGroups.map(g => g.id);

    if (groupIds.length === 0) {
      return [];
    }

    const worksheets = await this.prisma.workSheet.findMany({
      where: {
        groupId: { in: groupIds },
        // date: {
        //   gte: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
        //   lt: new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1),
        // }
      },
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
        records: true,
        _count: {
          select: {
            items: true,
            records: { where: { status: WorkRecordStatus.COMPLETED } }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return transformWorksheets(worksheets);
  }

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
            }
          }
        },
        createdBy: { select: { firstName: true, lastName: true, employeeCode: true } },
        items: {
          include: {
            worker: { select: { firstName: true, lastName: true, employeeCode: true } },
            product: { select: { name: true, code: true } },
            process: { select: { name: true, code: true } },
            records: {
              include: {
                record: { select: { workHour: true, startTime: true, endTime: true } }
              },
              orderBy: { record: { workHour: 'asc' } }
            }
          }
        },
        records: {
          include: {
            updatedBy: { select: { firstName: true, lastName: true, employeeCode: true } },
            itemRecords: {
              include: {
                item: {
                  include: {
                    worker: { select: { firstName: true, lastName: true, employeeCode: true } }
                  }
                },
                product: { select: { id: true, name: true, code: true } },
                process: { select: { id: true, name: true, code: true } }
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
    const canAccess = 
      user.role === Role.SUPERADMIN ||
      user.role === Role.ADMIN ||
      worksheet.createdById === user.id ||
      worksheet.group.leaderId === user.id;

    if (!canAccess) {
      throw new ForbiddenException('You do not have access to this worksheet');
    }

    return transformWorksheet(worksheet);
  }

  async updateRecord(
    worksheetId: string,
    recordId: string,
    updateRecordDto: UpdateWorksheetRecordDto,
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

    console.log('Worksheet:', worksheet);

    const record = worksheet.records[0];
    if (!record) {
      throw new NotFoundException('Worksheet record not found');
    }

    // Check permissions - only group leader or admin can update records
    const canUpdate = 
      user.role === Role.SUPERADMIN ||
      user.role === Role.ADMIN ||
      worksheet.group.leaderId === user.id;

    if (!canUpdate) {
      throw new ForbiddenException('You can only update records for groups you lead');
    }

    // Update record with transaction for item records
    return this.prisma.$transaction(async (tx) => {
      // Update main record
      const updatedRecord = await tx.workSheetRecord.update({
        where: { id: recordId },
        data: {
          status: updateRecordDto.status || WorkRecordStatus.IN_PROGRESS,
          updatedById: user.id,
        }
      });

      // Update item records if provided
      if (updateRecordDto.itemRecords && updateRecordDto.itemRecords.length > 0) {
        // Get existing entries for this record
        const existingEntries = await tx.workSheetItemRecord.findMany({
          where: { recordId: updatedRecord.id },
          orderBy: { entryIndex: 'asc' }
        });

        // Create a map of existing entries by itemId for quick lookup
        const existingEntriesMap = new Map<string, any[]>();
        existingEntries.forEach(entry => {
          if (!existingEntriesMap.has(entry.itemId)) {
            existingEntriesMap.set(entry.itemId, []);
          }
          existingEntriesMap.get(entry.itemId)!.push(entry);
        });

        await Promise.all(
          updateRecordDto.itemRecords.map(async (itemRecord) => {
            let entryIndex = itemRecord.entryIndex;
            
            // If entryIndex is provided, use it directly
            if (entryIndex) {
              // Use provided entryIndex
            } else {
              // If no entryIndex provided, check for existing entries for this itemId
              const existingForItem = existingEntriesMap.get(itemRecord.itemId);
              if (existingForItem && existingForItem.length > 0) {
                // Update the first existing entry
                entryIndex = existingForItem[0].entryIndex;
              } else {
                // No existing entries, create new one with entryIndex 1
                entryIndex = 1;
              }
            }

            await tx.workSheetItemRecord.upsert({
              where: {
                recordId_itemId_entryIndex: {
                  recordId: updatedRecord.id,
                  itemId: itemRecord.itemId,
                  entryIndex: entryIndex
                }
              },
              update: {
                actualOutput: itemRecord.actualOutput,
                productId: itemRecord.productId,
                processId: itemRecord.processId,
                note: itemRecord.note,
              },
              create: {
                recordId: updatedRecord.id,
                itemId: itemRecord.itemId,
                entryIndex: entryIndex,
                actualOutput: itemRecord.actualOutput,
                productId: itemRecord.productId,
                processId: itemRecord.processId,
                note: itemRecord.note,
              }
            });
          })
        );
      }

      const record = await tx.workSheetRecord.findUnique({
        where: { id: recordId },
        include: {
          itemRecords: {
            include: {
              item: {
                include: {
                  worker: { select: { firstName: true, lastName: true, employeeCode: true } }
                }
              },
              product: { select: { name: true, code: true } },
              process: { select: { name: true, code: true } }
            }
          }
        }
      });

      return transformWorksheetRecord(record);
    });
  }

  async batchUpdateRecords(
    worksheetId: string,
    batchUpdateDto: BatchUpdateRecordsDto,
    user: any
  ) {
    // Validate worksheet exists
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
      throw new ForbiddenException('You can only update records for groups you lead');
    }

    // Batch update with transaction
    return this.prisma.$transaction(async (tx) => {
      const results = await Promise.all(
        batchUpdateDto.records.map(async (recordUpdate) => {
          // Update record status
          const updatedRecord = await tx.workSheetRecord.update({
            where: { id: recordUpdate.recordId },
            data: {
              status: recordUpdate.status || WorkRecordStatus.IN_PROGRESS,
              updatedById: user.id,
            }
          });

          // Update item records
          if (recordUpdate.itemRecords) {
            // Get existing entries for this record
            const existingEntries = await tx.workSheetItemRecord.findMany({
              where: { recordId: updatedRecord.id },
              orderBy: { entryIndex: 'asc' }
            });

            // Create a map of existing entries by itemId for quick lookup
            const existingEntriesMap = new Map<string, any[]>();
            existingEntries.forEach(entry => {
              if (!existingEntriesMap.has(entry.itemId)) {
                existingEntriesMap.set(entry.itemId, []);
              }
              existingEntriesMap.get(entry.itemId)!.push(entry);
            });

            await Promise.all(
              recordUpdate.itemRecords.map(async (itemRecord) => {
                let entryIndex = itemRecord.entryIndex;
                
                // If entryIndex is provided, use it directly
                if (entryIndex) {
                  // Use provided entryIndex
                } else {
                  // If no entryIndex provided, check for existing entries for this itemId
                  const existingForItem = existingEntriesMap.get(itemRecord.itemId);
                  if (existingForItem && existingForItem.length > 0) {
                    // Update the first existing entry
                    entryIndex = existingForItem[0].entryIndex;
                  } else {
                    // No existing entries, create new one with entryIndex 1
                    entryIndex = 1;
                  }
                }

                await tx.workSheetItemRecord.upsert({
                  where: {
                    recordId_itemId_entryIndex: {
                      recordId: updatedRecord.id,
                      itemId: itemRecord.itemId,
                      entryIndex: entryIndex
                    }
                  },
                  update: {
                    actualOutput: itemRecord.actualOutput,
                    productId: itemRecord.productId,
                    processId: itemRecord.processId,
                    targetOutput: itemRecord.targetOutput,
                    note: itemRecord.note,
                  },
                  create: {
                    recordId: updatedRecord.id,
                    itemId: itemRecord.itemId,
                    entryIndex: entryIndex,
                    actualOutput: itemRecord.actualOutput,
                    productId: itemRecord.productId,
                    processId: itemRecord.processId,
                    targetOutput: itemRecord.targetOutput,
                    note: itemRecord.note,
                  }
                });
              })
            );
          }

          return updatedRecord;
        })
      );

      return {
        message: 'Batch update completed successfully',
        updatedRecords: results.length,
        records: transformWorksheetRecords(results)
      };
    });
  }

  async getAnalytics(worksheetId: string, user: any) {
    const worksheet = await this.prisma.workSheet.findUnique({
      where: { id: worksheetId },
      include: {
        group: { select: { leaderId: true } },
        items: {
          include: {
            records: {
              include: {
                record: { select: { workHour: true } }
              }
            }
          }
        },
        records: {
          include: {
            itemRecords: {
              include: {
                product: { select: { id: true, name: true, code: true } },
                process: { select: { id: true, name: true, code: true } }
              }
            }
          }
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
      worksheet.group.leaderId === user.id;

    if (!canAccess) {
      throw new ForbiddenException('You do not have access to this worksheet analytics');
    }

    // Calculate analytics
    const totalRecords = worksheet.records.length;
    const completedRecords = worksheet.records.filter(r => r.status === WorkRecordStatus.COMPLETED).length;
    const totalOutput = worksheet.records.reduce((sum, record) => 
      sum + record.itemRecords.reduce((itemSum, item) => itemSum + item.actualOutput, 0), 0
    );
    const targetOutput = worksheet.targetOutputPerHour * totalRecords;
    const efficiency = targetOutput > 0 ? (totalOutput / targetOutput) * 100 : 0;

    // Hourly breakdown
    const hourlyData = worksheet.records.map(record => {
      const hourOutput = record.itemRecords.reduce((sum, item) => sum + item.actualOutput, 0);
      return {
        workHour: record.workHour,
        targetOutput: worksheet.targetOutputPerHour,
        actualOutput: hourOutput,
        efficiency: worksheet.targetOutputPerHour > 0 ? (hourOutput / worksheet.targetOutputPerHour) * 100 : 0,
        status: record.status,
        workerCount: record.itemRecords.length
      };
    });

    // Worker performance - using individual targetOutputPerHour from WorkSheetItem
    const workerPerformance = worksheet.items.map(item => {
      const workerOutput = item.records.reduce((sum, record) => sum + record.actualOutput, 0);
      const workerHours = item.records.length;
      // Use individual worker target from WorkSheetItem
      const standardOutputPerWorker = item.targetOutputPerHour || 0;
      const expectedOutput = standardOutputPerWorker * workerHours;
      
      return {
        workerId: item.workerId,
        totalOutput: workerOutput,
        hoursWorked: workerHours,
        averagePerHour: workerHours > 0 ? workerOutput / workerHours : 0,
        efficiency: expectedOutput > 0 ? (workerOutput / expectedOutput) * 100 : 0,
        expectedOutput, // For debugging/verification
        standardOutputPerHour: standardOutputPerWorker, // Individual target
        targetOutputPerHour: item.targetOutputPerHour // From database
      };
    });

    return {
      summary: {
        totalRecords,
        completedRecords,
        completionRate: totalRecords > 0 ? (completedRecords / totalRecords) * 100 : 0,
        totalOutput,
        targetOutput,
        efficiency: Math.round(efficiency),
        totalWorkers: worksheet.totalWorkers
      },
      hourlyData,
      workerPerformance,
      trends: {
        peakHour: hourlyData.reduce((max, hour) => 
          hour.actualOutput > max.actualOutput ? hour : max, 
          { workHour: 0, actualOutput: 0 }
        ),
        lowestHour: hourlyData.reduce((min, hour) => 
          hour.actualOutput < min.actualOutput ? hour : min,
          { workHour: 0, actualOutput: Infinity }
        )
      }
    };
  }


  async update(id: string, updateWorksheetDto: UpdateWorksheetDto, user: any) {
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
      throw new ForbiddenException('You can only update worksheets you created');
    }

    return this.prisma.workSheet.update({
      where: { id },
      data: updateWorksheetDto,
      include: {
        factory: { select: { name: true, code: true } },
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
        }
      }
    });
  }

  async remove(id: string, user: any) {
    const worksheet = await this.prisma.workSheet.findUnique({
      where: { id }
    });

    if (!worksheet) {
      throw new NotFoundException('Worksheet not found');
    }

    // Only admin can delete
    if (user.role !== Role.SUPERADMIN && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Only administrators can delete worksheets');
    }

    return this.prisma.workSheet.delete({
      where: { id }
    });
  }

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
      throw new ForbiddenException('You can only complete worksheets for groups you lead');
    }

    return this.prisma.workSheet.update({
      where: { id },
      data: { status: WorkSheetStatus.COMPLETED }
    });
  }

  async archiveOldWorksheets(beforeDate?: Date, user?: any) {
    // Only admin can archive
    if (user.role !== Role.SUPERADMIN && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Only administrators can archive worksheets');
    }

    const archiveDate = beforeDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

    // Implementation for archiving - simplified
    const worksheetsToArchive = await this.prisma.workSheet.count({
      where: {
        date: { lt: archiveDate },
        status: { not: WorkSheetStatus.ARCHIVED }
      }
    });

    if (worksheetsToArchive === 0) {
      return { message: 'No worksheets to archive', count: 0 };
    }

    // Mark as archived (actual backup logic would be more complex)
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

  // Helper method to get work hours based on shift type
  private getWorkHoursForShift(shiftType: ShiftType) {
    const baseHours = [
      { hour: 1, startTime: '07:30', endTime: '08:30' },
      { hour: 2, startTime: '08:30', endTime: '09:30' },
      { hour: 3, startTime: '09:30', endTime: '10:30' },
      { hour: 4, startTime: '10:30', endTime: '11:30' },
      // Lunch break 11:30-12:30
      { hour: 5, startTime: '12:30', endTime: '13:30' },
      { hour: 6, startTime: '13:30', endTime: '14:30' },
      { hour: 7, startTime: '14:30', endTime: '15:30' },
      { hour: 8, startTime: '15:30', endTime: '16:30' }
    ];

    switch (shiftType) {
      case ShiftType.NORMAL_8H:
        return baseHours; // 7 working hours as per problem statement

      case ShiftType.EXTENDED_9_5H:
        return [
          ...baseHours,
          { hour: 9, startTime: '16:30', endTime: '17:00' },
          { hour: 10, startTime: '17:00', endTime: '18:00' },
        ];

      case ShiftType.OVERTIME_11H:
        return [
          ...baseHours,
          // Dinner break 16:30-17:00
          { hour: 9, startTime: '17:00', endTime: '18:00' },
          { hour: 10, startTime: '18:00', endTime: '19:00' },
          { hour: 11, startTime: '19:00', endTime: '20:00' },
        ];

      default:
        return baseHours;
    }
  }

  /**
   * Get work hours with full DateTime objects using the actual worksheet date
   * This replaces the old method that only used time components
   */
  private getWorkHoursWithDate(shiftType: ShiftType, worksheetDate: Date) {
    const timeSlots = this.getWorkHoursForShift(shiftType);
    
    return timeSlots.map(({ hour, startTime, endTime }) => {
      // Create proper DateTime objects with the actual worksheet date
      const startDateTime = this.createDateTimeFromTimeString(worksheetDate, startTime);
      const endDateTime = this.createDateTimeFromTimeString(worksheetDate, endTime);
      
      return {
        hour,
        startTime: startDateTime,
        endTime: endDateTime
      };
    });
  }

  /**
   * Create a proper DateTime object from a date and time string
   * Fixed to handle timezone correctly and avoid 1970 date issues
   */
  private createDateTimeFromTimeString(date: Date, timeString: string): Date {
    const [hours, minutes] = timeString.split(':').map(Number);
    
    // Ensure we have valid numbers
    if (isNaN(hours) || isNaN(minutes)) {
      throw new Error(`Invalid time string: ${timeString}`);
    }
    
    // Create a new Date object based on the provided date
    // Use the date's year, month, and day, but set specific hours/minutes
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();
    
    // Create DateTime using explicit UTC values to avoid timezone conversion issues
    // This ensures the time is stored as intended regardless of server timezone
    const dateTime = new Date(Date.UTC(year, month, day, hours, minutes, 0, 0));
    
    return dateTime;
  }

  async quickUpdateRecord(
    worksheetId: string,
    recordId: string,
    quickUpdateDto: QuickUpdateRecordDto,
    user: any
  ) {
    // Convert to standard update format
    const updateRecordDto: UpdateWorksheetRecordDto = {
      status: 'IN_PROGRESS' as WorkRecordStatus,
      itemRecords: quickUpdateDto.itemOutputs.map(item => ({
        itemId: item.itemId,
        actualOutput: item.actualOutput,
        productId: item.productId, // Allow changing bag code
        processId: item.processId, // Allow changing process code
        note: item.note
      }))
    };

    return this.updateRecord(worksheetId, recordId, updateRecordDto, user);
  }

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
        factory: { select: { name: true, code: true } },
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
            itemRecords: {
              include: {
                product: { select: { id: true, name: true, code: true } },
                process: { select: { id: true, name: true, code: true } }
              }
            }
          }
        },
        _count: {
          select: { items: true }
        }
      }
    });

    // Calculate real-time metrics
    const totalWorksheets = worksheets.length;
    const totalWorkers = worksheets.reduce((sum, ws) => sum + ws.totalWorkers, 0);
    
    let totalTargetOutput = 0;
    let totalActualOutput = 0;
    let completedRecords = 0;
    let totalRecords = 0;

    const factoryStats = new Map<string, any>();

    worksheets.forEach(worksheet => {
      const factoryCode = worksheet.factory.code;
      
      if (!factoryStats.has(factoryCode)) {
        factoryStats.set(factoryCode, {
          name: worksheet.factory.name,
          code: factoryCode,
          worksheets: 0,
          workers: 0,
          targetOutput: 0,
          actualOutput: 0,
          completedRecords: 0,
          totalRecords: 0
        });
      }

      const factory = factoryStats.get(factoryCode);
      factory.worksheets += 1;
      factory.workers += worksheet.totalWorkers;

      worksheet.records.forEach(record => {
        totalRecords += 1;
        factory.totalRecords += 1;
        
        const recordTarget = worksheet.targetOutputPerHour;
        const recordActual = record.itemRecords.reduce((sum, item) => sum + item.actualOutput, 0);
        
        totalTargetOutput += recordTarget;
        totalActualOutput += recordActual;
        factory.targetOutput += recordTarget;
        factory.actualOutput += recordActual;
        
        if (record.status === 'COMPLETED') {
          completedRecords += 1;
          factory.completedRecords += 1;
        }
      });
    });

    const overallEfficiency = totalTargetOutput > 0 ? 
      Math.round((totalActualOutput / totalTargetOutput) * 100) : 0;

    return {
      summary: {
        date: date.toISOString().split('T')[0],
        totalWorksheets,
        totalWorkers,
        totalTargetOutput,
        totalActualOutput,
        overallEfficiency,
        completionRate: totalRecords > 0 ? 
          Math.round((completedRecords / totalRecords) * 100) : 0,
        activeFactories: factoryStats.size
      },
      factories: Array.from(factoryStats.values()).map(factory => ({
        ...factory,
        efficiency: factory.targetOutput > 0 ? 
          Math.round((factory.actualOutput / factory.targetOutput) * 100) : 0,
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
        records: {
          include: {
            itemRecords: {
              include: {
                product: { select: { id: true, name: true, code: true } },
                process: { select: { id: true, name: true, code: true } }
              }
            }
          },
          orderBy: { workHour: 'asc' }
        },
        items: {
          include: {
            worker: {
              select: { firstName: true, lastName: true, employeeCode: true }
            }
          }
        }
      }
    });

    return {
      factory: worksheets[0]?.factory || { name: 'Unknown', code: 'N/A' },
      date: date.toISOString().split('T')[0],
      worksheets: worksheets.map(worksheet => ({
        id: worksheet.id,
        group: worksheet.group,
        performance: this.calculateGroupPerformance(worksheet),
        records: worksheet.records,
        items: worksheet.items
      })),
      summary: {
        totalGroups: worksheets.length,
        totalWorkers: worksheets.reduce((sum, ws) => sum + ws.totalWorkers, 0),
        avgEfficiency: this.calculateAverageEfficiency(worksheets)
      }
    };
  }

  private calculateGroupPerformance(worksheet: any) {
    // worksheet.targetOutputPerHour is the total group target (standardOutputPerWorker * totalWorkers)
    const totalTarget = worksheet.records.length * worksheet.targetOutputPerHour;
    const totalActual = worksheet.records.reduce((sum, record) => 
      sum + record.itemRecords.reduce((itemSum, item) => itemSum + item.actualOutput, 0), 0
    );
    const completedRecords = worksheet.records.filter(r => r.status === 'COMPLETED').length;
    
    return {
      efficiency: totalTarget > 0 ? Math.round((totalActual / totalTarget) * 100) : 0,
      completionRate: worksheet.records.length > 0 ? 
        Math.round((completedRecords / worksheet.records.length) * 100) : 0,
      totalOutput: totalActual,
      targetOutput: totalTarget
    };
  }

  private calculateAverageEfficiency(worksheets: any[]) {
    if (worksheets.length === 0) return 0;
    
    const totalEfficiency = worksheets.reduce((sum, worksheet) => {
      const performance = this.calculateGroupPerformance(worksheet);
      return sum + performance.efficiency;
    }, 0);
    
    return Math.round(totalEfficiency / worksheets.length);
  }

  // ============= NEW METHODS REQUIRED BY PROBLEM STATEMENT =============

  /**
   * GetWorksheetGrid - Returns matrix view (rows=workers, columns=hours)
   */
  async getWorksheetGrid(worksheetId: string, user: any) {
    const worksheet = await this.prisma.workSheet.findUnique({
      where: { id: worksheetId },
      include: {
        group: { select: { leaderId: true } },
        items: {
          include: {
            worker: { select: { firstName: true, lastName: true, employeeCode: true } },
            product: { select: { name: true, code: true, id: true } },
            process: { select: { name: true, code: true, id: true } },
            records: {
              include: {
                record: { select: { workHour: true, startTime: true, endTime: true } },
                product: { select: { name: true, code: true, id: true } },
                process: { select: { name: true, code: true, id: true } }
              },
              orderBy: { record: { workHour: 'asc' } }
            }
          }
        },
        records: {
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
      worksheet.group.leaderId === user.id;

    if (!canAccess) {
      throw new ForbiddenException('You do not have access to this worksheet');
    }

    // Build grid matrix
    const workers = worksheet.items.map(item => ({
      itemId: item.id,
      worker: item.worker,
      defaultProduct: item.product,
      defaultProcess: item.process
    }));

    const hours = worksheet.records.map(record => ({
      workHour: record.workHour,
      startTime: transformWorksheetRecord(record).startTime,
      endTime: transformWorksheetRecord(record).endTime,
      expectedOutputTotal: record.expectedOutputTotal
    }));

    // Build matrix: rows=workers, columns=hours
    const grid = workers.map(worker => {
      const hourlyData = hours.map(hour => {
        const workerItemRecords = worker.itemId ? 
          worksheet.items.find(item => item.id === worker.itemId)?.records.filter(rec => rec.record.workHour === hour.workHour) :
          [];

        // Support multiple entries per hour
        const entries = workerItemRecords.map(itemRecord => ({
          entryIndex: itemRecord.entryIndex || 1,
          product: itemRecord.product || worker.defaultProduct,
          process: itemRecord.process || worker.defaultProcess,
          targetOutput: itemRecord.targetOutput || null,
          actualOutput: itemRecord.actualOutput || 0,
          variance: itemRecord.variance || null,
          note: itemRecord.note || null
        }));

        return {
          workHour: hour.workHour,
          startTime: hour.startTime,
          endTime: hour.endTime,
          entries: entries.length > 0 ? entries : [
            // Default empty entry if no records exist
            {
              entryIndex: 1,
              product: worker.defaultProduct,
              process: worker.defaultProcess,
              targetOutput: null,
              actualOutput: 0,
              variance: null,
              note: null
            }
          ]
        };
      });

      return {
        worker: worker.worker,
        itemId: worker.itemId,
        hourlyData
      };
    });

    return {
      worksheetId,
      workers,
      hours,
      grid
    };
  }

  /**
   * UpsertHourOutputs - Batch upsert for single hour with variance calculation
   * 🔥 FIXED: Implements complete replacement semantics for proper deletion support
   */
  async upsertHourOutputs(
    recordId: string, 
    entries: Array<{
      itemId: string;
      entryIndex?: number;
      actualOutput: number;
      productId?: string;
      processId?: string;
      targetOutput?: number;
      note?: string;
    }>,
    user: any
  ) {

    // Validate record exists and get worksheet
    const record = await this.prisma.workSheetRecord.findUnique({
      where: { id: recordId },
      include: {
        worksheet: {
          include: {
            group: { select: { leaderId: true } }
          }
        }
      }
    });

    if (!record) {
      throw new NotFoundException('Worksheet record not found');
    }

    // Check permissions
    const canUpdate = 
      user.role === Role.SUPERADMIN ||
      user.role === Role.ADMIN ||
      record.worksheet.group.leaderId === user.id;

    if (!canUpdate) {
      throw new ForbiddenException('You can only update records for groups you lead');
    }

    // 🔥 CRITICAL FIX: Implement complete replacement semantics for proper deletion
    return await this.prisma.$transaction(async (tx) => {
      
      // 🔥 STEP 1: Get all existing entries for this record
      const existingEntries = await tx.workSheetItemRecord.findMany({
        where: { recordId },
        orderBy: { entryIndex: 'asc' }
      });


      // 🔥 STEP 2: Group incoming entries by itemId
      const entriesByItemId = new Map<string, typeof entries>();
      entries.forEach(entry => {
        if (!entriesByItemId.has(entry.itemId)) {
          entriesByItemId.set(entry.itemId, []);
        }
        entriesByItemId.get(entry.itemId)!.push(entry);
      });


      // 🔥 STEP 3: For each itemId with entries, do complete replacement
      const updatedRecords = await Promise.all(
        Array.from(entriesByItemId.entries()).map(async ([itemId, itemEntries]) => {
          
          // 🔥 STEP 3.1: DELETE all existing entries for this itemId
          const deleteResult = await tx.workSheetItemRecord.deleteMany({
            where: {
              recordId: recordId,
              itemId: itemId
            }
          });

          // 🔥 STEP 3.2: CREATE new entries with correct entryIndex sequence
          const newRecords = await Promise.all(
            itemEntries.map(async (entry, index) => {
              const correctEntryIndex = entry.entryIndex !== undefined ? entry.entryIndex : index;
              
              // Calculate variance: actual - target
              const variance = entry.targetOutput !== undefined ? 
                entry.actualOutput - entry.targetOutput : null;

              const newRecord = await tx.workSheetItemRecord.create({
                data: {
                  recordId: recordId,
                  itemId: itemId,
                  entryIndex: correctEntryIndex,
                  actualOutput: entry.actualOutput,
                  productId: entry.productId,
                  processId: entry.processId,
                  targetOutput: entry.targetOutput,
                  variance: variance,
                  note: entry.note
                },
                include: {
                  item: {
                    include: {
                      worker: { select: { firstName: true, lastName: true, employeeCode: true } }
                    }
                  },
                  product: { select: { name: true, code: true } },
                  process: { select: { name: true, code: true } }
                }
              });

              return newRecord;
            })
          );

          return newRecords;
        })
      );

      // Flatten results
      const allNewRecords = updatedRecords.flat();

      // Update record status and timestamp
      await tx.workSheetRecord.update({
        where: { id: recordId },
        data: {
          status: WorkRecordStatus.IN_PROGRESS,
          updatedById: user.id,
          updatedAt: new Date()
        }
      });

      return allNewRecords;
    });
  }

  /**
   * AdjustRecordTarget - Update group-level target by hour
   */
  async adjustRecordTarget(
    worksheetId: string,
    workHour: number,
    expectedOutputTotal: number,
    user: any
  ) {
    // Validate worksheet and get record
    const worksheet = await this.prisma.workSheet.findUnique({
      where: { id: worksheetId },
      include: {
        group: { select: { leaderId: true } },
        records: { where: { workHour: workHour } }
      }
    });

    if (!worksheet) {
      throw new NotFoundException('Worksheet not found');
    }

    const record = worksheet.records[0];
    if (!record) {
      throw new NotFoundException('Worksheet record not found for specified hour');
    }

    // Check permissions
    const canUpdate = 
      user.role === Role.SUPERADMIN ||
      user.role === Role.ADMIN ||
      worksheet.group.leaderId === user.id;

    if (!canUpdate) {
      throw new ForbiddenException('You can only update records for groups you lead');
    }

    const updatedRecord = await this.prisma.workSheetRecord.update({
      where: { id: record.id },
      data: {
        expectedOutputTotal,
        updatedById: user.id,
        updatedAt: new Date()
      },
      include: {
        itemRecords: {
          include: {
            item: {
              include: {
                worker: { select: { firstName: true, lastName: true, employeeCode: true } }
              }
            },
            product: { select: { id: true, name: true, code: true } },
            process: { select: { id: true, name: true, code: true } }
          }
        }
        }
      });

    return transformWorksheetRecord(updatedRecord);
  }

  /**
   * UpsertRecordCauses - Handle cause tracking (VT, CN, CL, MM)
   */
  async upsertRecordCauses(
    recordId: string,
    causes: Array<{
      cause: 'MATERIALS' | 'TECHNOLOGY' | 'QUALITY' | 'MACHINERY' | 'OTHER';
      delta: number;
      note?: string;
    }>,
    user: any
  ) {
    // Validate record exists and get worksheet
    const record = await this.prisma.workSheetRecord.findUnique({
      where: { id: recordId },
      include: {
        worksheet: {
          include: {
            group: { select: { leaderId: true } }
          }
        }
      }
    });

    if (!record) {
      throw new NotFoundException('Worksheet record not found');
    }

    // Check permissions
    const canUpdate = 
      user.role === Role.SUPERADMIN ||
      user.role === Role.ADMIN ||
      record.worksheet.group.leaderId === user.id;

    if (!canUpdate) {
      throw new ForbiddenException('You can only update records for groups you lead');
    }

    // Upsert causes with transaction
    return await this.prisma.$transaction(async (tx) => {
      const updatedCauses = await Promise.all(
        causes.map(async (causeData) => {
          return await tx.workSheetRecordCause.upsert({
            where: {
              recordId_cause: {
                recordId: recordId,
                cause: causeData.cause as any
              }
            },
            update: {
              delta: causeData.delta,
              note: causeData.note,
            },
            create: {
              recordId: recordId,
              cause: causeData.cause as any,
              delta: causeData.delta,
              note: causeData.note,
            }
          });
        })
      );

      return updatedCauses;
    });
  }

  /**
   * CopyForwardProductProcess - Copy defaults for speed input
   */
  async copyForwardProductProcess(
    worksheetId: string,
    fromHour: number,
    toHourStart: number,
    toHourEnd: number,
    user: any
  ) {
    // Validate worksheet
    const worksheet = await this.prisma.workSheet.findUnique({
      where: { id: worksheetId },
      include: {
        group: { select: { leaderId: true } },
        items: true,
        records: {
          where: {
            OR: [
              { workHour: fromHour },
              { workHour: { gte: toHourStart, lte: toHourEnd } }
            ]
          },
          include: {
            itemRecords: true
          }
        }
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
      throw new ForbiddenException('You can only update records for groups you lead');
    }

    // Find source records from fromHour
    const sourceRecord = worksheet.records.find(r => r.workHour === fromHour);
    if (!sourceRecord || !sourceRecord.itemRecords.length) {
      throw new BadRequestException('Source hour has no data to copy from');
    }

    // Get target records
    const targetRecords = worksheet.records.filter(r => 
      r.workHour >= toHourStart && r.workHour <= toHourEnd
    );

    // Copy product/process for each worker to target hours
    return await this.prisma.$transaction(async (tx) => {
      const results = await Promise.all(
        targetRecords.map(async (targetRecord) => {
          const updatedItems = await Promise.all(
            worksheet.items.map(async (item) => {
              // Find source item record for this worker
              const sourceItemRecord = sourceRecord.itemRecords.find(sir => sir.itemId === item.id);
              
              if (sourceItemRecord) {
                return await tx.workSheetItemRecord.upsert({
                  where: {
                    recordId_itemId_entryIndex: {
                      recordId: targetRecord.id,
                      itemId: item.id,
                      entryIndex: 1  // Default entry for copying
                    }
                  },
                  update: {
                    productId: sourceItemRecord.productId,
                    processId: sourceItemRecord.processId,
                    updatedAt: new Date()
                  },
                  create: {
                    recordId: targetRecord.id,
                    itemId: item.id,
                    entryIndex: 1,  // Default entry
                    productId: sourceItemRecord.productId,
                    processId: sourceItemRecord.processId,
                    actualOutput: 0
                  }
                });
              }
              return null;
            })
          );

          return {
            workHour: targetRecord.workHour,
            updatedItems: updatedItems.filter(Boolean)
          };
        })
      );

      return {
        worksheetId,
        fromHour,
        toHourStart,
        toHourEnd,
        copiedRecords: results
      };
    });
  }

  /**
   * GetRealtimeAnalytics - Real-time production analytics
   */
  async getRealtimeAnalytics(filters: {
    factoryId?: string;
    date?: Date;
    userId?: string;
    userRole?: Role;
  }) {
    const targetDate = filters.date || new Date();
    const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
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

    // Apply role-based filtering
    if (filters.userRole === Role.USER) {
      // Group leaders can only see their own groups
      const myGroups = await this.prisma.group.findMany({
        where: { leaderId: filters.userId },
        select: { id: true }
      });
      where.groupId = { in: myGroups.map(g => g.id) };
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
        records: {
          include: {
            itemRecords: {
              include: {
                product: { select: { id: true, name: true, code: true } },
                process: { select: { id: true, name: true, code: true } }
              }
            }
          }
        }
      }
    });

    // Calculate real-time metrics
    const currentHour = new Date().getHours();
    const metrics = {
      totalWorksheets: worksheets.length,
      totalWorkers: worksheets.reduce((sum, ws) => sum + ws.totalWorkers, 0),
      currentHourProgress: 0,
      overallEfficiency: 0,
      activeFactories: new Set(worksheets.map(ws => ws.factory.code)).size
    };

    let totalTarget = 0;
    let totalActual = 0;
    let currentHourTarget = 0;
    let currentHourActual = 0;

    worksheets.forEach(worksheet => {
      worksheet.records.forEach(record => {
        const recordTarget = worksheet.targetOutputPerHour;
        const recordActual = record.itemRecords.reduce((sum, item) => sum + item.actualOutput, 0);
        
        totalTarget += recordTarget;
        totalActual += recordActual;

        // Current hour progress (approximate based on work hour mapping)
        if (this.isCurrentWorkHour(record.workHour, currentHour)) {
          currentHourTarget += recordTarget;
          currentHourActual += recordActual;
        }
      });
    });

    metrics.overallEfficiency = totalTarget > 0 ? Math.round((totalActual / totalTarget) * 100) : 0;
    metrics.currentHourProgress = currentHourTarget > 0 ? Math.round((currentHourActual / currentHourTarget) * 100) : 0;

    return {
      timestamp: new Date().toISOString(),
      date: targetDate.toISOString().split('T')[0],
      metrics,
      worksheets: worksheets.map(ws => ({
        id: ws.id,
        factory: ws.factory,
        group: ws.group,
        totalWorkers: ws.totalWorkers,
        targetPerHour: ws.targetOutputPerHour,
        currentProgress: this.calculateCurrentProgress(ws),
        status: ws.status
      }))
    };
  }

  private isCurrentWorkHour(workHour: number, currentHour: number): boolean {
    // Map work hours to actual clock hours based on shift schedule
    const hourMapping = {
      1: 7,  // 07:30-08:30
      2: 8,  // 08:30-09:30
      3: 9,  // 09:30-10:30
      4: 10, // 10:30-11:30
      5: 12, // 12:30-13:30 (after lunch)
      6: 13, // 13:30-14:30
      7: 14, // 14:30-15:30
      8: 15, // 15:30-16:30
      9: 16, // 16:30-17:00 or 17:00-18:00
      10: 17, // 17:00-18:00 or 18:00-19:00
      11: 18, // 18:00-19:00 or 19:00-20:00
    };

    return hourMapping[workHour] === currentHour;
  }

  private calculateCurrentProgress(worksheet: any): number {
    const totalRecords = worksheet.records.length;
    const completedRecords = worksheet.records.filter(r => r.status === 'COMPLETED').length;
    return totalRecords > 0 ? Math.round((completedRecords / totalRecords) * 100) : 0;
  }

  // ============= WORKSHEET ITEM METHODS =============

  async updateWorkerTarget(itemId: string, targetOutputPerHour: number, user: any) {
    // Get the worksheet item with worksheet info for access control
    const item = await this.prisma.workSheetItem.findUnique({
      where: { id: itemId },
      include: {
        worksheet: {
          include: {
            group: { select: { leaderId: true } }
          }
        }
      }
    });

    if (!item) {
      throw new NotFoundException('Worksheet item not found');
    }

    // Check access permissions
    const canAccess = 
      user.role === Role.SUPERADMIN ||
      user.role === Role.ADMIN ||
      item.worksheet.group.leaderId === user.id;

    if (!canAccess) {
      throw new ForbiddenException('You do not have permission to update this worker target');
    }

    // Validate target value
    if (targetOutputPerHour <= 0) {
      throw new BadRequestException('Target output per hour must be positive');
    }

    // Update the individual worker target
    const updatedItem = await this.prisma.workSheetItem.update({
      where: { id: itemId },
      data: { targetOutputPerHour },
      include: {
        worker: { select: { firstName: true, lastName: true, employeeCode: true } },
        product: { select: { name: true, code: true } },
        process: { select: { name: true, code: true } }
      }
    });

    return {
      message: 'Worker target updated successfully',
      item: updatedItem
    };
  }

  // ============= BACKUP SERVICE DELEGATION =============
  
  async triggerManualBackup(year: number, month: number, retentionDays: number = 30) {
    // Delegate to backup service directly via Prisma
    const backupService = new (await import('./worksheet-backup.service')).WorksheetBackupService(this.prisma);
    return await backupService.triggerManualBackup(year, month, retentionDays);
  }

  async getBackupStatistics() {
    // Delegate to backup service directly via Prisma
    const backupService = new (await import('./worksheet-backup.service')).WorksheetBackupService(this.prisma);
    return await backupService.getBackupStatistics();
  }
}
