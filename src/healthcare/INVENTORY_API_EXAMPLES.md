# API Usage Examples - Inventory Management

## 1️⃣ Medicine Categories Management

### Get all categories
```bash
GET /inventory/categories

Response:
[
  {
    "id": "uuid",
    "code": "I",
    "name": "NHÓM THUỐC HẠ SỐT, GIẢM ĐAU, CHỐNG VIÊM KHÔNG STEROID",
    "sortOrder": 1,
    "isActive": true,
    "_count": {
      "medicines": 15
    }
  }
]
```

### Create category
```bash
POST /inventory/categories
Content-Type: application/json

{
  "code": "XVIII",
  "name": "NHÓM THUỐC MỚI",
  "description": "Mô tả nhóm thuốc",
  "sortOrder": 18
}
```

## 2️⃣ Inventory Transactions

### Import medicines (Nhập kho)
```bash
POST /inventory/transactions
Content-Type: application/json

{
  "medicineId": "medicine-uuid-here",
  "type": "IMPORT",
  "quantity": 1000,
  "unitPrice": 5000,
  "transactionDate": "2024-01-15",
  "expiryDate": "2025-12-31",
  "batchNumber": "LOT2024001",
  "supplier": "Công ty TNHH ABC",
  "notes": "Nhập kho đợt 1 tháng 1/2024",
  "createdBy": "doctor-user-id"
}

Response:
{
  "id": "transaction-uuid",
  "type": "IMPORT",
  "quantity": 1000,
  "unitPrice": 5000,
  "totalAmount": 5000000,
  "medicine": {
    "name": "Paracetamol 500mg",
    "category": { ... }
  }
}
```

### Export medicines (Xuất kho thủ công)
```bash
POST /inventory/transactions
Content-Type: application/json

{
  "medicineId": "medicine-uuid",
  "type": "EXPORT",
  "quantity": 100,
  "unitPrice": 5000,
  "notes": "Xuất kho cho chi nhánh 2",
  "createdBy": "user-id"
}
```

### Adjustment (Điều chỉnh kiểm kê)
```bash
POST /inventory/transactions
Content-Type: application/json

{
  "medicineId": "medicine-uuid",
  "type": "ADJUSTMENT",
  "quantity": -50,
  "unitPrice": 5000,
  "notes": "Hỏng hóc, hết hạn",
  "createdBy": "user-id"
}
```

### Get transaction history
```bash
GET /inventory/transactions?medicineId=xxx&type=IMPORT&startDate=2024-01-01&endDate=2024-12-31

Response:
[
  {
    "id": "uuid",
    "type": "IMPORT",
    "quantity": 1000,
    "unitPrice": 5000,
    "totalAmount": 5000000,
    "transactionDate": "2024-01-15",
    "medicine": {
      "name": "Paracetamol",
      "category": { "code": "I", "name": "..." }
    },
    "supplier": "ABC",
    "batchNumber": "LOT001"
  }
]
```

## 3️⃣ Bulk Import from Excel

### Frontend code (React/Next.js)
```typescript
import * as XLSX from 'xlsx';

const handleImport = async (file: File) => {
  // Parse Excel
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer);
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(worksheet);
  
  // Transform to API format
  const medicines = rows.map((row: any) => ({
    stt: row['A'] || row['STT'],
    name: row['B'] || row['TÊN THUỐC'],
    categoryCode: row['NHÓM'] || extractCategoryFromRow(row),
    route: row['C'] || row['ĐƯỜNG DÙNG'],
    strength: row['D'] || row['HÀM LƯỢNG'],
    manufacturer: row['E'] || row['NƠI SX'],
    units: row['F'] || row['ĐƠN VỊ TÍNH'],
    
    // Tồn đầu kỳ (columns G, H, I)
    openingQuantity: parseFloat(row['G']) || 0,
    openingUnitPrice: parseFloat(row['H']) || 0,
    
    // Nhập trong tháng (columns J, K, L)
    monthlyImportQuantity: parseFloat(row['J']) || 0,
    monthlyImportUnitPrice: parseFloat(row['K']) || 0,
    
    // Xuất trong tháng (columns M, N, O)
    monthlyExportQuantity: parseFloat(row['M']) || 0,
    monthlyExportUnitPrice: parseFloat(row['N']) || 0,
    
    // Tồn cuối kỳ (columns P, Q, R)
    closingQuantity: parseFloat(row['P']) || 0,
    closingUnitPrice: parseFloat(row['Q']) || 0,
    
    // Hạn sử dụng (column S)
    expiryDate: parseExcelDate(row['S']),
    
    // Lũy kế năm nhập (columns T, U, V)
    yearlyImportQuantity: parseFloat(row['T']) || 0,
    yearlyImportUnitPrice: parseFloat(row['U']) || 0,
    
    // Lũy kế năm xuất (columns W, X, Y)
    yearlyExportQuantity: parseFloat(row['W']) || 0,
    yearlyExportUnitPrice: parseFloat(row['X']) || 0,
    
    // Đề nghị mua (columns Z, AA, AB)
    suggestedPurchaseQuantity: parseFloat(row['Z']) || 0,
    suggestedPurchaseUnitPrice: parseFloat(row['AA']) || 0,
  }));
  
  // Call API
  const response = await fetch('/api/inventory/bulk-import', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      month: selectedMonth,
      year: selectedYear,
      medicines
    })
  });
  
  const result = await response.json();
  console.log('Import result:', result);
  // { imported: 50, updated: 10, errors: [] }
};
```

### API call
```bash
POST /inventory/bulk-import
Content-Type: application/json

{
  "month": 1,
  "year": 2024,
  "medicines": [
    {
      "stt": 1,
      "name": "Paracetamol",
      "categoryCode": "I",
      "route": "UỐNG",
      "strength": "500mg",
      "manufacturer": "Việt Nam",
      "units": "viên",
      "openingQuantity": 1000,
      "openingUnitPrice": 100,
      "monthlyImportQuantity": 500,
      "monthlyImportUnitPrice": 100,
      "monthlyExportQuantity": 300,
      "monthlyExportUnitPrice": 100,
      "closingQuantity": 1200,
      "closingUnitPrice": 100,
      "expiryDate": "2025-12-31",
      "yearlyImportQuantity": 500,
      "yearlyImportUnitPrice": 100,
      "yearlyExportQuantity": 300,
      "yearlyExportUnitPrice": 100,
      "suggestedPurchaseQuantity": 1000,
      "suggestedPurchaseUnitPrice": 100
    }
  ]
}

Response:
{
  "imported": 1,
  "updated": 0,
  "errors": []
}
```

## 4️⃣ Reports

### Monthly report
```bash
GET /inventory/reports/monthly?month=1&year=2024&categoryId=xxx

Response:
{
  "month": 1,
  "year": 2024,
  "inventories": [
    {
      "id": "uuid",
      "medicine": {
        "id": "uuid",
        "name": "Paracetamol 500mg",
        "route": "UỐNG",
        "strength": "500mg",
        "units": "viên",
        "category": {
          "code": "I",
          "name": "NHÓM THUỐC HẠ SỐT..."
        }
      },
      "openingQuantity": 1000,
      "openingUnitPrice": 100,
      "openingTotalAmount": 100000,
      "monthlyImportQuantity": 500,
      "monthlyImportUnitPrice": 100,
      "monthlyImportAmount": 50000,
      "monthlyExportQuantity": 300,
      "monthlyExportUnitPrice": 100,
      "monthlyExportAmount": 30000,
      "closingQuantity": 1200,
      "closingUnitPrice": 100,
      "closingTotalAmount": 120000,
      "expiryDate": "2025-12-31"
    }
  ],
  "summary": {
    "totalOpeningAmount": 5000000,
    "totalImportAmount": 2000000,
    "totalExportAmount": 1500000,
    "totalClosingAmount": 5500000,
    "totalSuggestedAmount": 3000000
  }
}
```

### Yearly report
```bash
GET /inventory/reports/yearly/2024

Response:
{
  "year": 2024,
  "months": [
    {
      "month": 1,
      "inventories": [...],
      "summary": { ... }
    },
    {
      "month": 2,
      "inventories": [...],
      "summary": { ... }
    }
  ]
}
```

## 5️⃣ Stock Alerts

### Get low stock and expiring items
```bash
GET /inventory/stock/alerts?minThreshold=10&daysUntilExpiry=30

Response:
{
  "lowStockItems": [
    {
      "medicine": {
        "name": "Paracetamol",
        "category": { "name": "..." }
      },
      "closingQuantity": 5,
      "month": 1,
      "year": 2024
    }
  ],
  "expiringItems": [
    {
      "medicine": { "name": "Aspirin" },
      "expiryDate": "2024-02-15",
      "closingQuantity": 100,
      "month": 1,
      "year": 2024
    }
  ],
  "summary": {
    "lowStockCount": 5,
    "expiringCount": 3
  }
}
```

### Get current stock of a medicine
```bash
GET /inventory/stock/{medicineId}/current

Response:
{
  "medicine": {
    "id": "uuid",
    "name": "Paracetamol",
    "category": { "code": "I", "name": "..." }
  },
  "currentStock": 1200,
  "unitPrice": 100,
  "totalValue": 120000,
  "expiryDate": "2025-12-31"
}
```

## 6️⃣ Auto Stock Deduction (Kê đơn tự động trừ kho)

### Create medical record
```bash
POST /healthcare/medical-records
Content-Type: application/json

{
  "patientEmployeeCode": "NV001",
  "doctorId": "doctor-uuid",
  "symptoms": "Đau đầu, sốt",
  "diagnosis": "Cảm cúm",
  "prescriptions": [
    {
      "medicineId": "paracetamol-uuid",
      "quantity": 10,
      "dosage": "2 viên/lần",
      "frequency": "Sáng-tối",
      "duration": "5 ngày"
    }
  ]
}

Response:
{
  "id": "medical-record-uuid",
  "patient": { ... },
  "prescriptions": [ ... ]
}

// Tự động:
// 1. Tạo medical record
// 2. Tạo InventoryTransaction (type: EXPORT, quantity: 10)
// 3. Update MedicineInventory (closingQuantity -= 10)
```

## 7️⃣ Manual Update Inventory Balance

```bash
PATCH /inventory/balance
Content-Type: application/json

{
  "medicineId": "uuid",
  "month": 1,
  "year": 2024,
  "openingQuantity": 1000,
  "openingUnitPrice": 100,
  "suggestedPurchaseQuantity": 500,
  "suggestedPurchaseUnitPrice": 110,
  "expiryDate": "2025-12-31"
}

Response:
{
  "id": "uuid",
  "medicine": { ... },
  "openingQuantity": 1000,
  "openingUnitPrice": 100,
  // ... other fields updated
}
```

## 🎯 Common Workflows

### Workflow 1: Nhập thuốc mới
```bash
# 1. Tạo category (nếu chưa có)
POST /inventory/categories { code: "I", ... }

# 2. Import thuốc từ Excel hoặc tạo thủ công
POST /healthcare/medicines { name: "Paracetamol", ... }

# 3. Nhập kho
POST /inventory/transactions { type: "IMPORT", quantity: 1000, ... }

# 4. Check tồn kho
GET /inventory/stock/{medicineId}/current
```

### Workflow 2: Kê đơn thuốc
```bash
# 1. Check tồn kho trước
GET /inventory/stock/{medicineId}/current

# 2. Tạo medical record
POST /healthcare/medical-records { prescriptions: [...] }

# 3. Hệ thống tự động:
#    - Tạo EXPORT transaction
#    - Trừ tồn kho
```

### Workflow 3: Báo cáo cuối tháng
```bash
# 1. Lấy báo cáo tháng
GET /inventory/reports/monthly?month=1&year=2024

# 2. Check cảnh báo
GET /inventory/stock/alerts?minThreshold=10

# 3. Đề xuất mua thuốc (based on suggestedPurchase)
# Frontend hiển thị danh sách đề nghị mua
```
