# API Usage Examples for Gate Pass System

## 1. Create gate pass with flexible time input (recommended for frontend)

```http
POST /gate-passes/flexible
Content-Type: application/json

{
  "reasonType": "BUSINESS",
  "reasonDetail": "Đi họp với khách hàng",
  "location": "Công ty ABC - 123 Nguyễn Du, Q1",
  "date": "2024-01-15",
  "startTime": "14:00",
  "endTime": "16:30",
  "isFullDay": false
}
```

## 2. Create gate pass for full day

```http
POST /gate-passes/flexible
Content-Type: application/json

{
  "reasonType": "PERSONAL",
  "reasonDetail": "Giải quyết việc cá nhân",
  "location": "UBND Quận 1",
  "date": "2024-01-16",
  "isFullDay": true
}
```

## 3. Create gate pass for short break (1-2 hours)

```http
POST /gate-passes/flexible
Content-Type: application/json

{
  "reasonType": "SICK",
  "location": "Phòng khám Đa khoa Sài Gòn",
  "startTime": "10:00",
  "endTime": "11:30"
}
```

## 4. Traditional method (full datetime)

```http
POST /gate-passes
Content-Type: application/json

{
  "reasonType": "BUSINESS",
  "reasonDetail": "Tham gia hội thảo",
  "location": "Khách sạn Rex - Q1",
  "startDateTime": "2024-01-15T13:30:00.000Z",
  "endDateTime": "2024-01-15T17:00:00.000Z"
}
```

## Response Structure

```json
{
  "id": "uuid",
  "passNumber": "GP202401150001",
  "reasonType": "BUSINESS",
  "reasonDetail": "Đi họp với khách hàng",
  "location": "Công ty ABC - 123 Nguyễn Du, Q1",
  "startDateTime": "2024-01-15T14:00:00.000Z",
  "endDateTime": "2024-01-15T16:30:00.000Z",
  "status": "PENDING",
  "user": {
    "employeeCode": "NV001",
    "firstName": "Nguyễn",
    "lastName": "Văn A",
    "jobPosition": {
      "jobName": "Nhân viên IT",
      "department": {
        "name": "Phòng Công nghệ thông tin"
      },
      "position": {
        "name": "Nhân viên"
      }
    }
  },
  "approvals": [
    {
      "approvalLevel": 1,
      "status": "PENDING",
      "approver": {
        "employeeCode": "QL001",
        "firstName": "Trần",
        "lastName": "Thị B"
      }
    },
    {
      "approvalLevel": 2, 
      "status": "PENDING",
      "approver": {
        "employeeCode": "GD001",
        "firstName": "Lê",
        "lastName": "Văn C"
      }
    }
  ]
}
```

## Available Reason Types

- `BUSINESS`: Công tác
- `DISCIPLINE`: Kỷ luật  
- `SICK`: Ốm
- `PERSONAL`: Việc riêng
- `OTHER`: Lý do khác (cần điền reasonDetail)

## Approval Flow

1. **Level 1**: Trưởng đơn vị (Department Manager)
2. **Level 2**: Người duyệt cấp cao (Higher Management)

Cả hai cấp duyệt đều phải approve thì giấy ra vào cổng mới được duyệt hoàn tất.