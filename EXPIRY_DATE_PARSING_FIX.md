# 📅 Hướng dẫn Import Hạn sử dụng từ Excel

## ✅ Đã sửa logic parse date

### Vấn đề trước đây
- Backend parse cột S (index 18) đúng nhưng chưa validate chặt chẽ
- Frontend parse sai cột (cột H thay vì cột S)
- Không validate invalid dates như 31/02/2025

### Cải tiến mới

#### 1. Backend (`import-inventory-from-excel.ts`)
✅ Parse cột S (index 18) - Hạn sử dụng  
✅ Hỗ trợ format **dd/mm/yyyy** (23/12/2025)  
✅ Hỗ trợ format **ISO** (2025-12-23)  
✅ Hỗ trợ **Excel serial number** (với fix Excel 1900 leap year bug)  
✅ **Validate chặt chẽ**: reject 31/02/2025, 40/12/2025, etc.

#### 2. Frontend (`InventoryTab.tsx`)
✅ Parse cột S (index 18) - Hạn sử dụng  
✅ Map đúng các cột inventory data (G-AB)  
✅ Validate date trước khi gửi lên backend  
✅ Consistent với backend logic

---

## 📋 Cấu trúc file Excel

```
Cột A: STT
Cột B: TÊN THUỐC
Cột C: ĐƯỜNG DÙNG (UỐNG, NHỎ MẮT, BÔI, DÁN)
Cột D: HÀM LƯỢNG (500mg, 10ml)
Cột E: NƠI SX
Cột F: ĐƠN VỊ TÍNH (viên, chai, lọ)
Cột G-I: TỒN ĐẦU KỲ (SL, ĐG, TT)
Cột J-L: NHẬP TRONG THÁNG (SL, ĐG, TT)
Cột M-O: XUẤT TRONG THÁNG (SL, ĐG, TT)
Cột P-R: TỒN CUỐI KỲ (SL, ĐG, TT)
Cột S: HẠN SỬ DỤNG ⭐ (dd/mm/yyyy - VD: 23/12/2025)
Cột T-V: LŨY KẾ NĂM NHẬP (SL, ĐG, TT)
Cột W-Y: LŨY KẾ NĂM XUẤT (SL, ĐG, TT)
Cột Z-AB: ĐỀ NGHỊ MUA (SL, ĐG, TT)
```

---

## 🎯 Format Hạn sử dụng được hỗ trợ

### 1. **dd/mm/yyyy** (Khuyến nghị - format Việt Nam)
```
23/12/2025
1/1/2024
31/12/2026
```

### 2. **ISO format** (yyyy-mm-dd)
```
2025-12-23
2024-01-01
2026-12-31
```

### 3. **Excel serial number** (auto khi copy từ Excel với date format)
```
46086 → 2026-02-24
44927 → 2023-01-01
```

---

## ⚠️ Validation Rules

### ✅ Valid dates
- ✅ `23/12/2025` → Parse thành công
- ✅ `1/1/2024` → Parse thành công (single digit day/month)
- ✅ `31/12/2026` → Parse thành công

### ❌ Invalid dates (sẽ bị reject)
- ❌ `31/02/2025` → Tháng 2 không có ngày 31
- ❌ `40/12/2025` → Ngày không hợp lệ (>31)
- ❌ `15/13/2025` → Tháng không hợp lệ (>12)
- ❌ `abc` → Format không hợp lệ
- ❌ Empty/null → Không có HSD

---

## 🧪 Testing

Chạy test script để verify logic:
```bash
npx tsx prisma/test-date-parse.ts
```

Expected output:
```
✅ Test 1: dd/mm/yyyy format - PASS
✅ Test 2: d/m/yyyy format - PASS
✅ Test 3: End of year - PASS
✅ Test 4: ISO format - PASS
✅ Test 5: Invalid date (Feb 31) - PASS (correctly rejected)
✅ Test 6: Invalid day (>31) - PASS (correctly rejected)
✅ Test 7: Invalid month (>12) - PASS (correctly rejected)

📊 Results: 9 passed, 0 failed
🎉 All tests passed!
```

---

## 📝 Ví dụ sử dụng

### Import từ backend (CLI)
```bash
npx tsx prisma/import-inventory-from-excel.ts prisma/inventory-data.xlsx 1 2024
```

### Import từ frontend (UI)
1. Vào tab "Inventory Management"
2. Click "Import from Excel"
3. Chọn file Excel
4. System sẽ tự động parse cột S (HSD) với format dd/mm/yyyy

---

## 🔍 Chi tiết kỹ thuật

### Backend Parse Logic
```typescript
// Cột S (index 18)
const expiryStr = row[18]?.toString().trim()

// Parse dd/mm/yyyy
if (expiryStr.includes('/')) {
  const [day, month, year] = expiryStr.split('/').map(Number)
  const isoDate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
  const date = new Date(isoDate)
  
  // Validate date components match
  if (date.getFullYear() === year && 
      date.getMonth() + 1 === month && 
      date.getDate() === day) {
    // Valid date ✅
  }
}
```

### Frontend Parse Logic
```typescript
// Column S (index 18)
expiryDate: parseExpiryDate(row[18])

// parseExpiryDate validates:
// 1. Range check (day 1-31, month 1-12, year >= 1900)
// 2. Calendar validation (rejects 31/02, 30/02, etc)
// 3. ISO format conversion
```

---

## 🚀 Migration Notes

Nếu bạn có dữ liệu cũ với format khác:
1. Chuẩn bị file Excel với cột S có format `dd/mm/yyyy`
2. Chạy import script với tháng/năm cụ thể
3. Kiểm tra log để verify dates được parse đúng
4. Nếu có warning về invalid dates, sửa trong Excel và import lại

---

## 🆘 Troubleshooting

### Warning: "Invalid calendar date"
```
⚠️  Invalid calendar date for Paracetamol: 31/02/2025 
    (day 31 does not exist in month 2/2025)
```
**Fix:** Sửa ngày trong Excel về giá trị hợp lệ (VD: 28/02/2025)

### Warning: "Out of range date"
```
⚠️  Out of range date for Aspirin: 40/12/2025 
    (day=40, month=12, year=2025)
```
**Fix:** Sửa ngày về khoảng hợp lệ (1-31)

### Warning: "Invalid date format"
```
⚠️  Invalid date format for Ibuprofen: 2025/12/23 
    (expected dd/mm/yyyy)
```
**Fix:** Đổi format sang dd/mm/yyyy (23/12/2025)

---

## ✨ Summary

| Feature | Before | After |
|---------|--------|-------|
| **Backend parse** | Cột S, basic validation | Cột S, chặt chẽ + validate calendar |
| **Frontend parse** | ❌ Cột H (sai) | ✅ Cột S (đúng) |
| **Format support** | dd/mm/yyyy only | dd/mm/yyyy, ISO, Excel serial |
| **Invalid date** | Accept 31/02 | ❌ Reject 31/02 |
| **Test coverage** | ❌ None | ✅ 9 test cases |

---

**Updated:** January 9, 2026  
**Status:** ✅ Production Ready
