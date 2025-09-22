// Script to validate sample manufacturing data structure
// This runs without Prisma client to test data integrity

// Mock enums for validation
enum OfficeType {
  HEAD_OFFICE = 'HEAD_OFFICE',
  FACTORY_OFFICE = 'FACTORY_OFFICE'
}

enum Role {
  SUPERADMIN = 'SUPERADMIN',
  ADMIN = 'ADMIN', 
  USER = 'USER',
  WORKER = 'WORKER',
  MEDICAL_STAFF = 'MEDICAL_STAFF'
}

// Sample products data (10 túi xách mẫu)
const SAMPLE_PRODUCTS = [
  {
    name: 'Túi xách văn phòng A1',
    code: 'TUI-A1',
    description: 'Túi xách công sở cao cấp màu đen',
    imageUrl: 'https://example.com/images/tui-a1.jpg'
  },
  {
    name: 'Túi xách du lịch B2', 
    code: 'TUI-B2',
    description: 'Túi xách du lịch size lớn màu nâu',
    imageUrl: 'https://example.com/images/tui-b2.jpg'
  },
  {
    name: 'Túi xách nữ C3',
    code: 'TUI-C3', 
    description: 'Túi xách thời trang nữ màu đỏ',
    imageUrl: 'https://example.com/images/tui-c3.jpg'
  },
  {
    name: 'Túi xách học sinh D4',
    code: 'TUI-D4',
    description: 'Túi xách học sinh đa năng',
    imageUrl: 'https://example.com/images/tui-d4.jpg'
  },
  {
    name: 'Túi xách công sở E5',
    code: 'TUI-E5',
    description: 'Túi xách công sở nam màu xanh đen', 
    imageUrl: 'https://example.com/images/tui-e5.jpg'
  },
  {
    name: 'Túi xách thể thao F6',
    code: 'TUI-F6',
    description: 'Túi xách thể thao chống nước màu xanh',
    imageUrl: 'https://example.com/images/tui-f6.jpg'
  },
  {
    name: 'Túi xách cao cấp G7',
    code: 'TUI-G7',
    description: 'Túi xách da thật cao cấp màu vàng',
    imageUrl: 'https://example.com/images/tui-g7.jpg'
  },
  {
    name: 'Túi xách mini H8',
    code: 'TUI-H8',
    description: 'Túi xách mini thời trang màu hồng',
    imageUrl: 'https://example.com/images/tui-h8.jpg'
  },
  {
    name: 'Túi xách laptop I9',
    code: 'TUI-I9',
    description: 'Túi xách đựng laptop văn phòng màu xám',
    imageUrl: 'https://example.com/images/tui-i9.jpg'
  },
  {
    name: 'Túi xách evening J10',
    code: 'TUI-J10',
    description: 'Túi xách dạ tiệc sang trọng màu bạc',
    imageUrl: 'https://example.com/images/tui-j10.jpg'
  }
];

// Sample processes data (15 công đoạn cơ bản)
const SAMPLE_PROCESSES = [
  {
    name: 'Cắt chặt vải',
    code: 'CD-01', 
    description: 'Công đoạn cắt chặt vải theo pattern'
  },
  {
    name: 'Lạng vải',
    code: 'CD-02',
    description: 'Công đoạn lạng vải thành từng miếng nhỏ'
  },
  {
    name: 'Ép định hình',
    code: 'CD-03',
    description: 'Ép định hình các chi tiết túi xách'
  },
  {
    name: 'May lót trong',
    code: 'CD-04', 
    description: 'May lót bên trong túi xách'
  },
  {
    name: 'May thân túi',
    code: 'CD-05',
    description: 'May thân chính của túi xách'
  },
  {
    name: 'Gắn khóa kéo',
    code: 'CD-06',
    description: 'Gắn khóa kéo và các phụ kiện'
  },
  {
    name: 'May quai túi', 
    code: 'CD-07',
    description: 'May và gắn quai túi xách'
  },
  {
    name: 'Hoàn thiện',
    code: 'CD-08',
    description: 'Hoàn thiện và kiểm tra chất lượng'
  },
  {
    name: 'Sơn quai',
    code: 'CD-09',
    description: 'Sơn và trang trí quai túi xách'
  },
  {
    name: 'Đóng gói',
    code: 'CD-10',
    description: 'Đóng gói sản phẩm hoàn thiện'
  },
  {
    name: 'Kiểm tra chất lượng',
    code: 'CD-11',
    description: 'Kiểm tra chất lượng chi tiết từng sản phẩm'
  },
  {
    name: 'Gắn logo thương hiệu',
    code: 'CD-12',
    description: 'Gắn logo và nhãn mác thương hiệu'
  },
  {
    name: 'Lót túi bằng vải',
    code: 'CD-13',
    description: 'Lót túi bằng vải mềm bên trong'
  },
  {
    name: 'Gia công chi tiết',
    code: 'CD-14',
    description: 'Gia công các chi tiết nhỏ và phụ kiện'
  },
  {
    name: 'Kiểm tra cuối cùng',
    code: 'CD-15',
    description: 'Kiểm tra cuối cùng trước khi xuất kho'
  }
];

// Sample worker data (20 workers)
const SAMPLE_WORKERS = [
  // 4 Group leaders (Role.USER)
  { firstName: 'Văn', lastName: 'Minh', phone: '0987654321', role: Role.USER },
  { firstName: 'Thị', lastName: 'Lan', phone: '0987654322', role: Role.USER },
  { firstName: 'Văn', lastName: 'Tùng', phone: '0987654323', role: Role.USER },
  { firstName: 'Thị', lastName: 'Mai', phone: '0987654324', role: Role.USER },
  
  // 16 Workers (Role.WORKER)
  { firstName: 'Văn', lastName: 'An', phone: '0987654325', role: Role.WORKER },
  { firstName: 'Thị', lastName: 'Bích', phone: '0987654326', role: Role.WORKER },
  { firstName: 'Văn', lastName: 'Cường', phone: '0987654327', role: Role.WORKER },
  { firstName: 'Thị', lastName: 'Dung', phone: '0987654328', role: Role.WORKER },
  { firstName: 'Văn', lastName: 'Đức', phone: '0987654329', role: Role.WORKER },
  { firstName: 'Thị', lastName: 'Em', phone: '0987654330', role: Role.WORKER },
  { firstName: 'Văn', lastName: 'Phong', phone: '0987654331', role: Role.WORKER },
  { firstName: 'Thị', lastName: 'Giang', phone: '0987654332', role: Role.WORKER },
  { firstName: 'Văn', lastName: 'Hải', phone: '0987654333', role: Role.WORKER },
  { firstName: 'Thị', lastName: 'Hoa', phone: '0987654334', role: Role.WORKER },
  { firstName: 'Văn', lastName: 'Khoa', phone: '0987654335', role: Role.WORKER },
  { firstName: 'Thị', lastName: 'Linh', phone: '0987654336', role: Role.WORKER },
  { firstName: 'Văn', lastName: 'Nam', phone: '0987654337', role: Role.WORKER },
  { firstName: 'Thị', lastName: 'Oanh', phone: '0987654338', role: Role.WORKER },
  { firstName: 'Văn', lastName: 'Phú', phone: '0987654339', role: Role.WORKER },
  { firstName: 'Thị', lastName: 'Quyên', phone: '0987654340', role: Role.WORKER }
];

function validateData() {
  console.log('🔍 Validating sample manufacturing data...\n');

  // 1. Validate products
  console.log('📦 Products validation:');
  console.log(`   ✅ Total products: ${SAMPLE_PRODUCTS.length}`);
  
  const productCodes = SAMPLE_PRODUCTS.map(p => p.code);
  const uniqueProductCodes = new Set(productCodes);
  
  if (productCodes.length === uniqueProductCodes.size) {
    console.log('   ✅ All product codes are unique');
  } else {
    console.log('   ❌ Duplicate product codes found!');
  }

  SAMPLE_PRODUCTS.forEach((product, index) => {
    if (!product.name || !product.code || !product.description) {
      console.log(`   ❌ Product ${index + 1} missing required fields`);
    } else {
      console.log(`   ✅ Product ${index + 1}: ${product.code} - ${product.name}`);
    }
  });

  // 2. Validate processes  
  console.log('\n⚙️ Processes validation:');
  console.log(`   ✅ Total processes: ${SAMPLE_PROCESSES.length}`);
  
  const processCodes = SAMPLE_PROCESSES.map(p => p.code);
  const uniqueProcessCodes = new Set(processCodes);
  
  if (processCodes.length === uniqueProcessCodes.size) {
    console.log('   ✅ All process codes are unique');
  } else {
    console.log('   ❌ Duplicate process codes found!');
  }

  SAMPLE_PROCESSES.forEach((process, index) => {
    if (!process.name || !process.code || !process.description) {
      console.log(`   ❌ Process ${index + 1} missing required fields`);
    } else {
      console.log(`   ✅ Process ${index + 1}: ${process.code} - ${process.name}`);
    }
  });

  // 3. Validate workers
  console.log('\n👥 Workers validation:');
  console.log(`   ✅ Total workers: ${SAMPLE_WORKERS.length}`);
  
  const leaders = SAMPLE_WORKERS.filter(w => w.role === Role.USER);
  const workers = SAMPLE_WORKERS.filter(w => w.role === Role.WORKER);
  
  console.log(`   👑 Leaders: ${leaders.length}`);
  console.log(`   👷 Workers: ${workers.length}`);

  // 4. Generate sample ProductProcess mappings preview
  console.log('\n🔗 Sample ProductProcess mappings preview:');
  
  let mappingCount = 0;
  for (const product of SAMPLE_PRODUCTS.slice(0, 3)) { // Preview first 3 products
    const processCount = Math.floor(Math.random() * 5) + 6; // 6-10 processes
    const selectedProcesses = SAMPLE_PROCESSES.slice(0, processCount);
    
    console.log(`\n   📦 ${product.code} - ${product.name}:`);
    
    selectedProcesses.forEach((process, index) => {
      // Generate realistic output per hour based on process complexity
      let standardOutput;
      switch (process.code) {
        case 'CD-01': case 'CD-02': case 'CD-10': // Quick processes
          standardOutput = Math.floor(Math.random() * 20) + 50; // 50-70/hour
          break;
        case 'CD-03': case 'CD-04': case 'CD-09': case 'CD-13': // Medium
          standardOutput = Math.floor(Math.random() * 15) + 30; // 30-45/hour
          break;
        case 'CD-05': case 'CD-07': case 'CD-14': // Complex
          standardOutput = Math.floor(Math.random() * 10) + 15; // 15-25/hour
          break;
        case 'CD-06': case 'CD-12': // Precision
          standardOutput = Math.floor(Math.random() * 15) + 25; // 25-40/hour
          break;
        case 'CD-08': case 'CD-11': case 'CD-15': // Quality control
          standardOutput = Math.floor(Math.random() * 20) + 35; // 35-55/hour
          break;
        default:
          standardOutput = Math.floor(Math.random() * 20) + 25; // 25-45/hour
      }
      
      console.log(`      ${index + 1}. ${process.code} - ${process.name} (${standardOutput}/h)`);
      mappingCount++;
    });
  }

  console.log(`\n   ✅ Sample mappings generated: ${mappingCount}`);

  // 5. Summary
  console.log('\n📊 Summary:');
  console.log(`   🎒 Products: ${SAMPLE_PRODUCTS.length}/10 (requirement met: ${SAMPLE_PRODUCTS.length >= 10 ? '✅' : '❌'})`);
  console.log(`   ⚙️ Processes: ${SAMPLE_PROCESSES.length}/15 (requirement met: ${SAMPLE_PROCESSES.length >= 15 ? '✅' : '❌'})`);
  console.log(`   👥 Workers: ${SAMPLE_WORKERS.length}/20`);
  console.log(`   👑 Leaders: ${leaders.length}/4`);
  console.log(`   🔗 Est. ProductProcess mappings: ~${SAMPLE_PRODUCTS.length * 8} (avg 8 processes per product)`);

  console.log('\n✨ Sample data validation completed!');
  console.log('🎯 Ready for Phase 2.2 - Sample Manufacturing Data implementation');
}

// Run validation
validateData();

export {
  SAMPLE_PRODUCTS,
  SAMPLE_PROCESSES,
  SAMPLE_WORKERS
};