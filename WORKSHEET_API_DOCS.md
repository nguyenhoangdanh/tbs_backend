# 📋 Worksheet Service - API Documentation

## ✅ HOÀN THÀNH IMPLEMENTATION

### **Schema Database** ✓
```prisma
WorkSheet (1 phiếu = 1 công nhân/ngày)
  ├── workerId (công nhân)
  ├── groupId (nhóm)
  ├── factoryId (nhà máy)
  ├── productId (mã túi mặc định)
  ├── processId (công đoạn mặc định)
  └── plannedOutput (SLKH/giờ)

WorkSheetRecord (1 record = 1 giờ làm việc)
  ├── worksheetId
  ├── workHour (1-11)
  ├── plannedOutput (SLKH giờ này)
  ├── actualOutput (SLTH tổng)
  └── items[] (chi tiết từng mã túi)

WorkSheetRecordItem ⭐ QUAN TRỌNG
  ├── recordId
  ├── entryIndex (1, 2, 3... nếu làm nhiều mã túi)
  ├── productId (mã túi cụ thể)
  ├── processId (công đoạn cụ thể)
  ├── actualOutput (sản lượng mã này)
  └── note (ghi chú)
```

---

## 📡 **API ENDPOINTS**

### **1. CORE APIS - Quan trọng nhất**

#### **A. Tạo phiếu công cho nhóm**
```typescript
POST /worksheets
{
  "groupId": "uuid",                    // Tạo cho cả nhóm
  "date": "2025-02-10",
  "shiftType": "NORMAL_8H",
  "productId": "uuid",                  // Mã túi mặc định
  "processId": "uuid",                  // Công đoạn mặc định
  "plannedOutput": 15                   // SLKH/giờ/người
}

Response:
{
  "message": "Successfully created 30 worksheets",
  "totalWorkers": 30,
  "totalWorksheets": 30,
  "date": "2025-02-10",
  "group": { "id": "xxx", "name": "Nhóm 1" },
  "product": "Túi A",
  "process": "Chặt"
}
```

#### **B. Batch Update By Hour** ⭐ **CORE API**
```typescript
POST /worksheets/group/:groupId/hour/:workHour/batch-update
{
  "date": "2025-02-10",
  "outputs": [
    {
      "workerId": "uuid1",
      "entries": [
        { "productId": "tui-a", "processId": "chat", "actualOutput": 5, "note": "Túi A" },
        { "productId": "tui-b", "processId": "chat", "actualOutput": 6, "note": "Túi B" }
      ]
    },
    {
      "workerId": "uuid2",
      "entries": [
        { "productId": "tui-a", "processId": "chat", "actualOutput": 12 }
      ]
    },
    // ...28 công nhân khác
  ]
}

Response:
{
  "message": "Updated 30 workers for hour 1",
  "groupId": "xxx",
  "workHour": 1,
  "date": "2025-02-10",
  "updates": [
    { "workerId": "uuid1", "recordId": "xxx", "totalActual": 11, "itemsCount": 2 },
    { "workerId": "uuid2", "recordId": "xxx", "totalActual": 12, "itemsCount": 1 },
    ...
  ]
}
```

#### **C. Get Worksheet Grid** (Matrix View)
```typescript
GET /worksheets/grid/:groupId?date=2025-02-10

Response:
{
  "group": { "id": "xxx", "name": "Nhóm 1" },
  "date": "2025-02-10",
  "totalWorkers": 30,
  "workers": [
    {
      "worksheetId": "xxx",
      "worker": { "employeeCode": "5001", "firstName": "Văn Minh" },
      "defaultProduct": { "name": "Túi A", "code": "TUI-A" },
      "defaultProcess": { "name": "Chặt", "code": "CHAT" },
      "plannedOutputPerHour": 15,
      "hours": [
        {
          "workHour": 1,
          "startTime": "07:30",
          "endTime": "08:30",
          "plannedOutput": 15,
          "actualOutput": 11,
          "status": "COMPLETED",
          "items": [
            { "entryIndex": 1, "product": "Túi A", "actualOutput": 5 },
            { "entryIndex": 2, "product": "Túi B", "actualOutput": 6 }
          ]
        },
        { "workHour": 2, ... },
        ...8 giờ
      ],
      "summary": {
        "totalPlanned": 120,
        "totalActual": 88,
        "efficiency": 73
      }
    },
    ...29 công nhân khác
  ]
}
```

---

### **2. QUERY APIS**

#### **A. Find All Worksheets**
```typescript
GET /worksheets?groupId=xxx&date=2025-02-10&status=ACTIVE

Response: Array of worksheets with summary
```

#### **B. Find One Worksheet**
```typescript
GET /worksheets/:id

Response: Full worksheet with records and items
```

#### **C. Get My Group Worksheets** (For Leaders)
```typescript
GET /worksheets/my-groups?date=2025-02-10

Response: Worksheets của tất cả nhóm mà user là leader
```

#### **D. Get Group Worksheets**
```typescript
GET /worksheets/group/:groupId?date=2025-02-10

Response: Tất cả worksheets của nhóm trong ngày
```

---

### **3. UPDATE APIS**

#### **A. Update Single Record**
```typescript
PATCH /worksheets/:id/records/:recordId
{
  "actualOutput": 12,
  "productId": "uuid",              // Optional: đổi mã túi
  "processId": "uuid",              // Optional: đổi công đoạn
  "plannedOutput": 15,              // Optional: điều chỉnh SLKH
  "note": "VT thiếu",
  "status": "COMPLETED"
}
```

#### **B. Quick Update** (Mobile)
```typescript
PATCH /worksheets/:id/records/:recordId/quick-update
{
  "actualOutput": 12,
  "note": "OK"
}
```

#### **C. Update Worksheet**
```typescript
PUT /worksheets/:id
{
  "status": "COMPLETED",
  "plannedOutput": 20,              // Điều chỉnh SLKH chung
  "productId": "uuid",              // Đổi mã túi mặc định
  "processId": "uuid"               // Đổi công đoạn mặc định
}
```

#### **D. Adjust Record Target**
```typescript
PATCH /worksheets/:id/adjust-target/:workHour
{
  "plannedOutput": 18               // Điều chỉnh SLKH cho giờ cụ thể
}
```

#### **E. Copy Forward**
```typescript
POST /worksheets/:id/copy-forward
{
  "fromHour": 3,                    // Copy từ giờ 3
  "toHourStart": 4,                 // Sang giờ 4-8
  "toHourEnd": 8
}
```

---

### **4. ANALYTICS APIS**

#### **A. Get Worksheet Analytics**
```typescript
GET /worksheets/:id/analytics

Response:
{
  "summary": {
    "totalRecords": 8,
    "completedRecords": 6,
    "completionRate": 75,
    "totalPlanned": 120,
    "totalActual": 88,
    "efficiency": 73
  },
  "hourlyData": [
    {
      "workHour": 1,
      "plannedOutput": 15,
      "actualOutput": 11,
      "efficiency": 73,
      "status": "COMPLETED",
      "itemsCount": 2,
      "products": [
        { "product": "Túi A", "actualOutput": 5 },
        { "product": "Túi B", "actualOutput": 6 }
      ]
    },
    ...
  ],
  "trends": {
    "peakHour": { "workHour": 3, "actualOutput": 15 },
    "lowestHour": { "workHour": 1, "actualOutput": 11 }
  }
}
```

#### **B. Today Production Dashboard**
```typescript
GET /worksheets/dashboard/today

Response:
{
  "summary": {
    "date": "2025-02-10",
    "totalWorksheets": 150,
    "totalPlanned": 18000,
    "totalActual": 13200,
    "overallEfficiency": 73,
    "completionRate": 80,
    "activeFactories": 3
  },
  "factories": [
    {
      "id": "xxx",
      "name": "Nhà máy 1",
      "totalWorksheets": 50,
      "totalPlanned": 6000,
      "totalActual": 4400,
      "efficiency": 73,
      "completionRate": 85
    },
    ...
  ]
}
```

#### **C. Factory Dashboard**
```typescript
GET /worksheets/dashboard/factory/:factoryId?date=2025-02-10

Response:
{
  "factory": { "name": "Nhà máy 1", "code": "NM1" },
  "date": "2025-02-10",
  "groups": [
    {
      "group": { "id": "xxx", "name": "Nhóm 1", "leader": {...} },
      "totalWorkers": 30,
      "totalPlanned": 3600,
      "totalActual": 2640,
      "efficiency": 73,
      "completionRate": 80
    },
    ...
  ],
  "summary": {
    "totalGroups": 5,
    "totalWorkers": 150
  }
}
```

#### **D. Realtime Analytics**
```typescript
GET /worksheets/analytics/realtime?factoryId=xxx&date=2025-02-10

Response:
{
  "summary": {
    "totalWorksheets": 150,
    "totalPlanned": 18000,
    "totalActual": 8800,
    "overallEfficiency": 49,
    "completionRate": 50
  },
  "currentHour": 14,
  "hourlyProgress": [
    {
      "workHour": 1,
      "totalPlanned": 2250,
      "totalActual": 2200,
      "efficiency": 98,
      "completionRate": 100,
      "isCurrentHour": false
    },
    {
      "workHour": 6,
      "totalPlanned": 2250,
      "totalActual": 1100,
      "efficiency": 49,
      "completionRate": 50,
      "isCurrentHour": true
    },
    ...
  ]
}
```

---

### **5. ADMIN APIS**

#### **A. Complete Worksheet**
```typescript
POST /worksheets/:id/complete
```

#### **B. Delete Worksheet**
```typescript
DELETE /worksheets/:id
```

#### **C. Archive Old Worksheets**
```typescript
POST /worksheets/archive-old?beforeDate=2025-01-01

Response:
{
  "message": "Worksheets archived successfully",
  "count": 450,
  "archiveDate": "2025-01-01T00:00:00.000Z"
}
```

---

## 🎯 **USE CASE FLOWS**

### **Flow 1: Tạo phiếu công buổi sáng**
```
1. Admin Line vào hệ thống
2. Chọn nhóm: "Nhóm 1 - Nhà máy 1"
3. Chọn ngày: 10/02/2025
4. Chọn ca: 8 giờ
5. Chọn túi mặc định: "Túi A"
6. Chọn công đoạn: "Chặt"
7. Nhập SLKH: 15 sản phẩm/giờ/người
8. Bấm "Tạo phiếu"

→ API: POST /worksheets
→ System tự động tạo 30 phiếu cho 30 công nhân
→ Mỗi phiếu có 8 records (8 giờ)
```

### **Flow 2: Nhóm trưởng nhập sản lượng Giờ 1**
```
1. Nhóm trưởng vào app mobile
2. Chọn ngày: hôm nay
3. Chọn giờ: Giờ 1 (07:30-08:30)
4. Thấy danh sách 30 công nhân
5. Nhập sản lượng từng người:
   - Văn Minh: Túi A: 5, Túi B: 6
   - Công nhân 2: Túi A: 12
   - ...
6. Bấm "Lưu tất cả" (Save All)

→ API: POST /worksheets/group/{groupId}/hour/1/batch-update
→ 1 request duy nhất update 30 records
→ Giảm thiểu call API, tăng performance
```

### **Flow 3: Xem báo cáo real-time**
```
1. Giám đốc nhà máy vào dashboard
2. Tự động load real-time analytics
3. Thấy:
   - Tổng sản lượng: 8800/18000 (49%)
   - Giờ hiện tại: Giờ 6 (đang chạy)
   - Giờ 1-5: Đã hoàn thành 98%
   - Giờ 6: Đang ở 49%
4. Drill down vào từng nhóm
5. Xem chi tiết từng công nhân

→ API: GET /worksheets/analytics/realtime
→ Auto refresh every 30s
```

---

## 🚀 **NEXT STEPS**

1. ✅ Schema đã hoàn chỉnh
2. ✅ Service đã implement xong
3. ⏳ **BẮT ĐẦU:** Chạy Prisma migration
4. ⏳ Update Controller thêm endpoints mới
5. ⏳ Test APIs với Postman
6. ⏳ Integrate với Frontend

---

## 📝 **NOTES**

- **Performance:** Batch API giảm 30x số lượng requests
- **Flexibility:** Hỗ trợ multiple products per hour
- **Real-time:** Dashboard tự động refresh
- **Role-based:** Phân quyền rõ ràng (Admin, Leader, Worker)
- **Audit:** Track updatedBy cho mọi thay đổi
