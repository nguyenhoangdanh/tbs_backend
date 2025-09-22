# TBS Management System - Backend

## 🎯 Tổng quan Dự án

TBS Management System là hệ thống quản lý toàn diện cho TBS Group, bao gồm:
- **Module hiện tại**: Hệ thống báo cáo công việc theo tuần (đang hoạt động - PRODUCTION READY)
- **Module mới**: Hệ thống phiếu công đoạn số hóa cho 3 nhà máy (TS1, TS2, TS3)

## 🏗️ Cấu trúc Hiện tại (KHÔNG ĐƯỢC CHỈNH SỬA)

### Hệ thống báo cáo tuần (Production Ready)
```
User → JobPosition → Department → Office
  ↓
Report (Weekly) → ReportTask → TaskEvaluation
  ↓
UserDepartmentManagement (Quản lý phòng ban)
```

**Models đang hoạt động (PROTECTED):**
- `User`, `Office`, `Department`, `Position`, `JobPosition`
- `Report`, `ReportTask`, `TaskEvaluation` 
- `UserDepartmentManagement`

## 🚀 Hệ thống Phiếu Công đoạn Mới

### Cấu trúc tổ chức sản xuất
```
Office → Factory → Line → Team → Group → Workers
```

### Quy trình số hóa phiếu công đoạn
```
Quản trị tạo WorkSheet → Nhóm trưởng cập nhật WorkSheetRecord → Ghi nhận sản lượng WorkSheetItemRecord
```

**Yêu cầu thực tế:**
- 4000 phiếu công đoạn/ngày (1 phiếu/công nhân)
- 3 ca làm việc: 8h, 9.5h, 11h
- Ghi nhận sản lượng theo từng giờ
- Mobile interface cho nhóm trưởng

## 🚀 Quick Setup Guide

### Initial Database Setup
```bash
# 1. Setup database schema
npm run local:setup

# 2. Import existing organizational data (optional)
npm run local:import

# 3. Create manufacturing structure and sample data
npm run local:import:manufacturing

# 4. Create additional sample workers (optional)
npm run local:create:worker
```

### Common Issues & Solutions
- **Foreign key constraint errors**: Run `npm run local:import:manufacturing` first to create job positions
- **Missing column errors**: Run `npm run local:setup` or `npm run local:db:push` to update database schema
- **Data conflicts**: Use `npm run local:migrate:reset` to reset and start fresh

## 📊 Database Schema

### Manufacturing Models (MỚI)
- `Factory` - 3 nhà máy (TS1, TS2, TS3)
- `Line` - 5 lines/nhà máy (Line 1,2,3,4 + Support)
- `Team` - Các tổ trong line
- `Group` - Nhóm nhỏ 15-30 người + nhóm trưởng
- `Product` - Sản phẩm túi xách (mã, tên, ảnh)
- `Process` - Công đoạn (chặt, lạng, ép, may thân...)
- `ProductProcess` - Sản lượng chuẩn/giờ cho từng sản phẩm-công đoạn

### WorkSheet System (MỚI)
- `WorkSheet` - Phiếu công đoạn hàng ngày
- `WorkSheetItem` - Chi tiết công nhân
- `WorkSheetRecord` - Ghi nhận theo giờ
- `WorkSheetItemRecord` - Sản lượng thực tế
- `WorkSheetMonthlyBackup` - Backup hàng tháng

## 🔄 Lộ trình Phát triển

### Phase 1: Database Setup ✅ DONE
- [x] Schema design hoàn thành
- [x] Models relationships configured
- [x] Indexing tối ưu performance

### Phase 2: Data Import & Setup ✅ COMPLETED

#### 2.1 Excel Import Enhancement 📋 TODO
**File:** `prisma/import-all-data-from-excel.ts`

**Cần thêm (KHÔNG SỬA CODE CŨ):**
```typescript
// Thêm vào ProcessedData interface
interface ProcessedData {
  // ...existing fields... (GIỮ NGUYÊN)
  factories: Map<string, { name: string, code: string }>;
  lines: Map<string, { name: string, factory: string }>;
}

// Functions mới
async function createFactoriesFromExcel() 
async function createLinesFromExcel()
async function createDefaultTeamsAndGroups()
```

**Excel Column Mapping:**
- Column E (Phòng ban) → Line names (LINE HT MAY 1, DH LINE 2...)  
- Column F (Trực thuộc) → Factory names (NM TS1, NM TS2, NM TS3)

#### 2.2 Sample Manufacturing Data ✅ COMPLETED
**File:** `prisma/sample-manufacturing-data.ts`
- ✅ 10 sản phẩm túi xách mẫu (TUI-A1 to TUI-J10)
- ✅ 15 công đoạn cơ bản (CD-01 to CD-15) 
- ✅ ProductProcess mappings với sản lượng chuẩn (realistic production rates)
- ✅ Complete factory structure (TS1, TS2, TS3)
- ✅ 20 sample workers with group assignments

**Validation:** `scripts/validate-sample-data.ts` - Test data integrity without DB connection

### Phase 3: API Development 📋 TODO

#### 3.1 Factory Management
**Module:** `src/modules/factory/`
```
GET /api/factories
GET /api/factories/:id/structure  
GET /api/lines/:lineId/teams
```

#### 3.2 Product & Process Management  
**Module:** `src/modules/manufacturing/`
```
CRUD /api/products
CRUD /api/processes
POST /api/products/:id/processes
GET /api/product-process/:productId/:processId
```

#### 3.3 WorkSheet Management
**Module:** `src/modules/worksheet/`
```
POST /api/worksheets (Quản trị tạo phiếu)
GET /api/worksheets/group/:groupId
PUT /api/worksheets/:id/records/:recordId (Nhóm trưởng cập nhật)
GET /api/worksheets/analytics/realtime
```

### Phase 4: Frontend Development 📋 TODO

#### 4.1 Admin Panel - Master Data
```
/admin/products - Quản lý sản phẩm, hình ảnh
/admin/processes - Quản lý công đoạn
/admin/product-processes - Mapping sản lượng chuẩn
/admin/factory-structure - Cấu trúc tổ chức
```

#### 4.2 Manager Dashboard
```
/manager/worksheet/create - Tạo phiếu theo nhóm
/manager/worksheet/monitor - Theo dõi progress realtime
/manager/analytics - Dashboard báo cáo
```

#### 4.3 Group Leader Mobile
```
/mobile/worksheet/:id - Phiếu nhóm hôm nay
/mobile/quick-entry/:workerId - Ghi nhận nhanh sản lượng
/mobile/batch-update - Cập nhật hàng loạt
```

### Phase 5: Performance & Deployment 📋 TODO

#### 5.1 Performance Testing
- Load test 4000 concurrent worksheets
- Database query optimization
- Real-time updates với WebSocket

#### 5.2 Backup & Archival
- Monthly data compression
- Auto-cleanup > 6 months old
- Historical reporting

## 📋 Development Rules

### ❌ TUYỆT ĐỐI KHÔNG
- Xóa/sửa Weekly Report models
- Thay đổi User/Office/Department/Position logic
- Sửa Report/ReportTask/TaskEvaluation
- Chỉnh UserDepartmentManagement system

### ✅ ĐƯỢC PHÉP  
- Thêm manufacturing models mới
- Thêm fields mới vào User (groupId đã có)
- Tạo relationships mới
- Performance optimization
- New APIs cho manufacturing

### 🔄 Backward Compatibility
- Tất cả APIs cũ hoạt động bình thường
- Weekly report system không bị ảnh hưởng  
- Migration scripts an toàn

## 📊 Performance Requirements

### Daily Load Expected
```sql
-- Manufacturing workload:
4000 WorkSheets/day
32,000 - 44,000 WorkSheetRecords/day (8-11h shifts)
32,000 - 44,000 WorkSheetItemRecords/day

-- Existing workload (unchanged):
Weekly Reports, TaskEvaluations, UserManagement
```

### Mobile Optimization
- Touch-friendly interfaces
- Offline capability
- Quick batch operations
- Real-time sync

## 🗂️ File Structure

### Database
- `prisma/schema.prisma` ✅ COMPLETED
- `prisma/import-all-data-from-excel.ts` 🔄 IN PROGRESS
- `prisma/sample-manufacturing-data.ts` 📋 TODO
- `prisma/seed.ts` ✅ COMPLETED

### APIs (Planned)
- `src/modules/factory/` 📋 TODO
- `src/modules/manufacturing/` 📋 TODO  
- `src/modules/worksheet/` 📋 TODO

### Frontend (Future)
- `frontend/src/pages/admin/` 📋 TODO
- `frontend/src/pages/manager/` 📋 TODO
- `frontend/src/pages/mobile/` 📋 TODO

## 🤖 AI Assistant Guidelines

### Code Safety Protocol
1. **PRESERVE** existing weekly report functionality
2. **ADD ONLY** manufacturing features
3. **TEST** backward compatibility
4. **OPTIMIZE** for 4000+ daily records
5. **MOBILE-FIRST** for group leaders

### Priority Tasks
1. Complete import script factory mapping
2. Create sample manufacturing data
3. Build basic CRUD APIs
4. Develop mobile-friendly interfaces
5. Implement real-time monitoring

**Status Legend:**
- ✅ COMPLETED - Finished & tested
- 🔄 IN PROGRESS - Currently working
- 📋 TODO - Planned for future
- ❌ BLOCKED - Waiting for dependencies
