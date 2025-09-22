import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { WorksheetService } from '../worksheet/worksheet.service';

@Injectable()
export class MobileService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => WorksheetService))
    private readonly worksheetService: WorksheetService,
  ) {}

  /**
   * Get mobile dashboard summary for group leaders
   */
  async getMobileDashboard(userId: string) {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

    // Get user's group worksheets for today
    const worksheets = await this.prisma.workSheet.findMany({
      where: {
        date: {
          gte: startOfDay,
          lt: endOfDay,
        },
        group: {
          leaderId: userId,
        },
      },
      include: {
        group: { select: { name: true } },
        factory: { select: { name: true, code: true } },
        records: {
          include: {
            itemRecords: true,
          },
        },
        _count: {
          select: {
            items: true,
            records: true,
          },
        },
      },
    });

    // Calculate summary stats
    const totalWorksheets = worksheets.length;
    const completedRecords = worksheets.reduce(
      (sum, ws) => sum + ws.records.filter(r => r.status === 'COMPLETED').length,
      0
    );
    const totalRecords = worksheets.reduce((sum, ws) => sum + ws.records.length, 0);
    const totalOutput = worksheets.reduce(
      (sum, ws) => sum + ws.records.reduce(
        (recordSum, r) => recordSum + r.itemRecords.reduce(
          (itemSum, ir) => itemSum + ir.actualOutput, 0
        ), 0
      ), 0
    );

    return {
      summary: {
        totalWorksheets,
        completedRecords,
        totalRecords,
        totalOutput,
        completionRate: totalRecords > 0 ? Math.round((completedRecords / totalRecords) * 100) : 0,
      },
      worksheets: worksheets.map(ws => ({
        id: ws.id,
        groupName: ws.group.name,
        factoryCode: ws.factory.code,
        shiftType: ws.shiftType,
        totalWorkers: ws.totalWorkers,
        completedRecords: ws.records.filter(r => r.status === 'COMPLETED').length,
        totalRecords: ws.records.length,
        status: ws.status,
        totalOutput: ws.records.reduce(
          (sum, r) => sum + r.itemRecords.reduce((itemSum, ir) => itemSum + ir.actualOutput, 0), 0
        ),
      })),
    };
  }

  /**
   * Get mobile-friendly worker list for quick entry
   */
  async getMobileWorkerList(worksheetId: string, userId: string) {
    const worksheet = await this.prisma.workSheet.findFirst({
      where: {
        id: worksheetId,
        group: {
          leaderId: userId,
        },
      },
      include: {
        items: {
          include: {
            worker: {
              select: {
                firstName: true,
                lastName: true,
                employeeCode: true,
              },
            },
            product: {
              select: {
                name: true,
                code: true,
              },
            },
            process: {
              select: {
                name: true,
                code: true,
              },
            },
          },
        },
      },
    });

    if (!worksheet) {
      throw new Error('Worksheet not found or access denied');
    }

    return worksheet.items.map(item => ({
      itemId: item.id,
      workerId: item.workerId,
      worker: {
        name: `${item.worker.firstName} ${item.worker.lastName}`,
        employeeCode: item.worker.employeeCode,
      },
      product: item.product,
      process: item.process,
    }));
  }

  /**
   * Get simplified group performance for mobile
   */
  async getMobileGroupPerformance(groupId: string, userId: string, date?: string) {
    const targetDate = date ? new Date(date) : new Date();
    const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
    const endOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + 1);

    // Verify user has access to this group
    const group = await this.prisma.group.findFirst({
      where: {
        id: groupId,
        leaderId: userId,
      },
    });

    if (!group) {
      throw new Error('Group not found or access denied');
    }

    const worksheets = await this.prisma.workSheet.findMany({
      where: {
        groupId,
        date: {
          gte: startOfDay,
          lt: endOfDay,
        },
      },
      include: {
        records: {
          include: {
            itemRecords: true,
          },
        },
        _count: {
          select: {
            items: true,
          },
        },
      },
    });

    if (worksheets.length === 0) {
      return {
        groupId,
        date: targetDate.toISOString().split('T')[0],
        worksheets: 0,
        totalWorkers: 0,
        totalOutput: 0,
        efficiency: 0,
        completionRate: 0,
      };
    }

    const totalWorkers = worksheets.reduce((sum, ws) => sum + ws._count.items, 0);
    const totalOutput = worksheets.reduce(
      (sum, ws) => sum + ws.records.reduce(
        (recordSum, r) => recordSum + r.itemRecords.reduce(
          (itemSum, ir) => itemSum + ir.actualOutput, 0
        ), 0
      ), 0
    );
    const targetOutput = worksheets.reduce(
      (sum, ws) => sum + (ws.targetOutputPerHour * ws.records.length), 0
    );
    const completedRecords = worksheets.reduce(
      (sum, ws) => sum + ws.records.filter(r => r.status === 'COMPLETED').length, 0
    );
    const totalRecords = worksheets.reduce((sum, ws) => sum + ws.records.length, 0);

    return {
      groupId,
      date: targetDate.toISOString().split('T')[0],
      worksheets: worksheets.length,
      totalWorkers,
      totalOutput,
      targetOutput,
      efficiency: targetOutput > 0 ? Math.round((totalOutput / targetOutput) * 100) : 0,
      completionRate: totalRecords > 0 ? Math.round((completedRecords / totalRecords) * 100) : 0,
    };
  }

  /**
   * Bulk sync for mobile offline capability
   */
  async mobileBulkSync(updates: any[], userId: string) {
    const results = [];
    
    for (const update of updates) {
      try {
        if (update.type === 'quick-update') {
          const result = await this.worksheetService.quickUpdateRecord(
            update.worksheetId,
            update.recordId,
            update.data,
            { id: userId }
          );
          results.push({ success: true, id: update.id, result });
        }
      } catch (error) {
        results.push({ success: false, id: update.id, error: error.message });
      }
    }

    return {
      processed: updates.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    };
  }

  /**
   * Check mobile app connectivity and sync status
   */
  async checkMobileSync(userId: string) {
    const lastUpdate = await this.prisma.workSheetRecord.findFirst({
      where: {
        updatedById: userId,
      },
      orderBy: {
        updatedAt: 'desc',
      },
      select: {
        updatedAt: true,
      },
    });

    return {
      status: 'connected',
      lastSync: lastUpdate?.updatedAt?.toISOString() || null,
      timestamp: new Date().toISOString(),
    };
  }
}