import { PrismaClient, OfficeType, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient({
  log: ['error', 'warn', 'info']
});

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

async function testConnection(): Promise<boolean> {
  try {
    console.log('🔍 Testing database connection...');
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ Database connection successful');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
}

async function createManufacturingStructure() {
  console.log('🏭 Creating complete manufacturing structure...');
  
  try {
    // 1. Create factory offices (TS1, TS2, TS3)
    console.log('\n📍 Step 1: Creating factory offices...');
    const offices = [];
    
    for (const factoryCode of ['TS1', 'TS2', 'TS3']) {
      const office = await prisma.office.upsert({
        where: { name: `NM ${factoryCode}` },
        update: {},
        create: {
          name: `NM ${factoryCode}`,
          type: OfficeType.FACTORY_OFFICE,
          description: `Văn phòng điều hành nhà máy ${factoryCode}`
        }
      });
      offices.push({ office, factoryCode });
      console.log(`   ✅ Office created: ${office.name}`);
    }

    // 2. Create worker position
    console.log('\n👔 Step 2: Creating positions...');
    const workerPosition = await prisma.position.upsert({
      where: { name: 'CN' },
      update: {},
      create: {
        name: 'CN',
        description: 'Công nhân',
        level: 8,
        priority: 8,
        isManagement: false,
        isReportable: false,
        canViewHierarchy: false
      }
    });
    console.log(`   ✅ Worker position: ${workerPosition.name}`);

    // Create group leader position
    const leaderPosition = await prisma.position.upsert({
      where: { name: 'TT' },
      update: {},
      create: {
        name: 'TT',
        description: 'Tổ trưởng',
        level: 6,
        priority: 6,
        isManagement: true,
        isReportable: false,
        canViewHierarchy: true
      }
    });
    console.log(`   ✅ Leader position: ${leaderPosition.name}`);

    // 3. Create departments and job positions
    console.log('\n🏬 Step 3: Creating departments and job positions...');
    const jobPositions = [];
    
    for (const { office, factoryCode } of offices) {
      // Create production department
      const department = await prisma.department.upsert({
        where: {
          name_officeId: {
            name: 'Phòng Sản Xuất',
            officeId: office.id
          }
        },
        update: {},
        create: {
          name: 'Phòng Sản Xuất',
          description: `Phòng sản xuất - ${factoryCode}`,
          officeId: office.id
        }
      });

      // Create job position for workers
      const workerJobPosition = await prisma.jobPosition.upsert({
        where: {
          positionId_jobName_departmentId: {
            positionId: workerPosition.id,
            jobName: 'Công nhân sản xuất',
            departmentId: department.id
          }
        },
        update: {},
        create: {
          jobName: 'Công nhân sản xuất',
          code: `NV_CNSX_${factoryCode}`,
          description: `Công nhân sản xuất - ${factoryCode}`,
          positionId: workerPosition.id,
          departmentId: department.id,
          officeId: office.id
        }
      });

      // Create job position for leaders
      const leaderJobPosition = await prisma.jobPosition.upsert({
        where: {
          positionId_jobName_departmentId: {
            positionId: leaderPosition.id,
            jobName: 'Tổ trưởng sản xuất',
            departmentId: department.id
          }
        },
        update: {},
        create: {
          jobName: 'Tổ trưởng sản xuất',
          code: `TT_CNSX_${factoryCode}`,
          description: `Tổ trưởng sản xuất - ${factoryCode}`,
          positionId: leaderPosition.id,
          departmentId: department.id,
          officeId: office.id
        }
      });

      jobPositions.push({
        factoryCode,
        office,
        department,
        workerJobPosition,
        leaderJobPosition
      });

      console.log(`   ✅ Job positions for ${factoryCode}`);
    }

    // 4. NOTE: No need to create Factory/Line - using Office & Department!
    // Office (FACTORY_OFFICE) = Factory
    // Department = Production Line
    console.log('\n✅ Step 4: Skipped - Using Office as Factory, Department as Line');

    // 5. Create teams (under Department, not Line)
    console.log('\n👥 Step 5: Creating teams under departments...');
    const teams = [];
    
    for (const { office, department, factoryCode } of jobPositions) {
      for (let t = 1; t <= 2; t++) { // Create 2 teams per department
        const team = await prisma.team.upsert({
          where: {
            code_departmentId: {
              code: `TEAM_${t}`,
              departmentId: department.id
            }
          },
          update: {},
          create: {
            name: `Tổ ${t}`,
            code: `TEAM_${t}`,
            description: `Tổ ${t} - ${department.name}`,
            departmentId: department.id
          }
        });
        teams.push({ team, factoryCode, office, department });
        console.log(`   ✅ Team: ${team.name} (${department.name})`);
      }
    }

    // 6. Create groups
    console.log('\n🏢 Step 7: Creating groups...');
    const groups = [];
    for (const { team, factoryCode } of teams) {
      for (let g = 1; g <= 2; g++) { // Create 2 groups per team
        const group = await prisma.group.upsert({
          where: {
            code_teamId: {
              code: `GROUP_${g}`,
              teamId: team.id
            }
          },
          update: {},
          create: {
            name: `Nhóm ${g}`,
            code: `GROUP_${g}`,
            description: `Nhóm ${g} - ${team.name}`,
            teamId: team.id
          }
        });
        groups.push({ group, factoryCode });
        console.log(`   ✅ Group: ${group.name} (${team.name})`);
      }
    }

    return { jobPositions, groups };

  } catch (error) {
    console.error('❌ Error creating manufacturing structure:', error);
    throw error;
  }
}

async function createWorkers(jobPositions: any[], groups: any[]) {
  console.log('\n👥 Creating sample workers...');
  
  const hashedPassword = await bcrypt.hash('123456', 10);
  let employeeCounter = 5001;
  const workers = [];

  for (const workerData of SAMPLE_WORKERS) {
    try {
      const employeeCode = employeeCounter.toString().padStart(4, '0');
      const fullName = `${workerData.lastName} ${workerData.firstName}`;
      
      // Generate email
      const normalizedLastName = workerData.lastName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd');
      const normalizedFirstName = workerData.firstName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd');
      
      const email = `${normalizedLastName}${normalizedFirstName.charAt(0)}${employeeCounter}@tbsgroup.vn`;

      // Check if exists
      const existing = await prisma.user.findUnique({
        where: { employeeCode }
      });

      if (existing) {
        console.warn(`   ⚠️  ${employeeCode} exists, skipping...`);
        employeeCounter++;
        continue;
      }

      // Rotate through job positions
      const jobPosIndex = (employeeCounter - 5001) % jobPositions.length;
      const selectedJobPos = jobPositions[jobPosIndex];
      
      const jobPosition = workerData.role === Role.USER 
        ? selectedJobPos.leaderJobPosition 
        : selectedJobPos.workerJobPosition;

      const worker = await prisma.user.create({
        data: {
          employeeCode,
          email,
          password: hashedPassword,
          firstName: workerData.firstName,
          lastName: workerData.lastName,
          phone: workerData.phone,
          role: workerData.role,
          isActive: true,
          jobPositionId: jobPosition.id,
          officeId: selectedJobPos.office.id
        }
      });

      workers.push(worker);
      console.log(`   ✅ ${employeeCode} - ${fullName} (${workerData.role}) - ${email}`);
      employeeCounter++;

    } catch (error) {
      const err = error as Error;
      console.error(`   ❌ Error creating worker ${workerData.firstName}:`, err.message);
      employeeCounter++;
    }
  }

  console.log(`\n📊 Created ${workers.length} workers`);

  // Assign to groups
  await assignWorkersToGroups(workers, groups);

  return workers;
}

async function assignWorkersToGroups(workers: any[], groups: any[]) {
  console.log('\n🏗️ Assigning workers to groups...');

  // Take first 4 groups
  const targetGroups = groups.slice(0, 4);
  
  // Split workers: 4 leaders + 16 workers
  const leaders = workers.filter(w => w.role === Role.USER).slice(0, 4);
  const regularWorkers = workers.filter(w => w.role === Role.WORKER);

  console.log(`👑 Leaders: ${leaders.length}, 👷 Workers: ${regularWorkers.length}`);

  for (let i = 0; i < targetGroups.length && i < leaders.length; i++) {
    const { group } = targetGroups[i];
    const leader = leaders[i];

    try {
      // Assign leader
      await prisma.group.update({
        where: { id: group.id },
        data: { leaderId: leader.id }
      });

      await prisma.user.update({
        where: { id: leader.id },
        data: { groupId: group.id }
      });

      console.log(`   👑 Leader: ${leader.employeeCode} → ${group.name}`);

      // Assign 4 workers to this group
      const groupWorkers = regularWorkers.slice(i * 4, (i + 1) * 4);
      
      for (const worker of groupWorkers) {
        await prisma.user.update({
          where: { id: worker.id },
          data: { groupId: group.id }
        });

        console.log(`   👷 Worker: ${worker.employeeCode} → ${group.name}`);
      }

    } catch (error) {
      const err = error as Error;
      console.error(`   ❌ Error assigning to group ${group.name}:`, err.message);
    }
  }
}

async function createSampleData() {
  console.log('🎯 Creating complete manufacturing sample data...');
  
  try {
    // Create structure and workers
    const { jobPositions, groups } = await createManufacturingStructure();
    await createWorkers(jobPositions, groups);

    // 8. Create products
    console.log('\n🎒 Step 8: Creating products...');
    const products = [];
    for (const productData of SAMPLE_PRODUCTS) {
      const product = await prisma.product.upsert({
        where: { code: productData.code },
        update: { ...productData },
        create: productData
      });
      products.push(product);
      console.log(`   ✅ Product: ${product.name}`);
    }

    // 9. Create processes
    console.log('\n⚙️ Step 9: Creating processes...');
    const processes = [];
    for (const processData of SAMPLE_PROCESSES) {
      const process = await prisma.process.upsert({
        where: { code: processData.code },
        update: { ...processData },
        create: processData
      });
      processes.push(process);
      console.log(`   ✅ Process: ${process.name}`);
    }

    // 10. Create product-process mappings
    console.log('\n🔗 Step 10: Creating product-process mappings...');
    let mappingCount = 0;
    
    for (const product of products) {
      // Each product has 6-10 processes in realistic sequence
      const processCount = Math.floor(Math.random() * 5) + 6; // 6-10 processes
      const selectedProcesses = processes.slice(0, processCount);
      
      for (let index = 0; index < selectedProcesses.length; index++) {
        const process = selectedProcesses[index];
        
        // Generate realistic output per hour based on process complexity
        let standardOutput;
        switch (process.code) {
          case 'CD-01': // Cắt chặt vải - Quick process
          case 'CD-02': // Lạng vải - Quick process  
          case 'CD-10': // Đóng gói - Quick process
            standardOutput = Math.floor(Math.random() * 20) + 50; // 50-70 pieces/hour
            break;
          case 'CD-03': // Ép định hình - Medium complexity
          case 'CD-04': // May lót - Medium complexity
          case 'CD-09': // Sơn quai - Medium complexity
          case 'CD-13': // Lót túi - Medium complexity
            standardOutput = Math.floor(Math.random() * 15) + 30; // 30-45 pieces/hour
            break;
          case 'CD-05': // May thân túi - Complex process
          case 'CD-07': // May quai - Complex process
          case 'CD-14': // Gia công chi tiết - Complex process
            standardOutput = Math.floor(Math.random() * 10) + 15; // 15-25 pieces/hour
            break;
          case 'CD-06': // Gắn khóa kéo - Precision work
          case 'CD-12': // Gắn logo - Precision work
            standardOutput = Math.floor(Math.random() * 15) + 25; // 25-40 pieces/hour
            break;
          case 'CD-08': // Hoàn thiện - Quality control
          case 'CD-11': // Kiểm tra chất lượng - Quality control
          case 'CD-15': // Kiểm tra cuối cùng - Quality control
            standardOutput = Math.floor(Math.random() * 20) + 35; // 35-55 pieces/hour
            break;
          default:
            standardOutput = Math.floor(Math.random() * 20) + 25; // 25-45 pieces/hour
        }
        
        await prisma.productProcess.upsert({
          where: {
            productId_processId: {
              productId: product.id,
              processId: process.id
            }
          },
          update: {
            standardOutputPerHour: standardOutput,
            sequence: index + 1
          },
          create: {
            productId: product.id,
            processId: process.id,
            standardOutputPerHour: standardOutput,
            sequence: index + 1
          }
        });
        
        mappingCount++;
        console.log(`   ✅ ${product.code} - ${process.code} (${standardOutput}/h) - Sequence ${index + 1}`);
      }
    }

    console.log('\n🎉 Sample data creation completed!');
    
    // Summary
    console.log('\n📊 Final Summary:');
    const userCount = await prisma.user.count();
    const workerCount = await prisma.user.count({ where: { role: Role.WORKER } });
    const leaderCount = await prisma.user.count({ where: { role: Role.USER, groupId: { not: null } } });
    const groupsWithLeaders = await prisma.group.count({ where: { leaderId: { not: null } } });

    console.log(`   👥 Total users: ${userCount}`);
    console.log(`   👷 Workers: ${workerCount}`);
    console.log(`   👑 Leaders: ${leaderCount}`);
    console.log(`   🏢 Groups with leaders: ${groupsWithLeaders}`);
    console.log(`   🎒 Products: ${products.length}`);
    console.log(`   ⚙️ Processes: ${processes.length}`);
    console.log(`   🔗 Mappings: ${mappingCount}`);

    console.log('\n✨ Ready for WorkSheet system!');

  } catch (error) {
    console.error('❌ Error creating sample data:', error);
    throw error;
  }
}

async function main() {
  console.log('🚀 Creating complete manufacturing sample data...');
  
  try {
    const connected = await testConnection();
    if (!connected) {
      process.exit(1);
    }

    await createSampleData();
    
  } catch (error) {
    console.error('❌ Failed:', error.message);
    
    // Provide helpful error message for common schema mismatch issues
    if (error.message.includes('standardWorkers') && error.message.includes('does not exist')) {
      console.error('\n🔧 Database Schema Mismatch Detected:');
      console.error('   The database schema is not up to date with the Prisma schema.');
      console.error('   Please run one of the following commands to fix this:');
      console.error('   • npm run local:setup (reset and setup database)');
      console.error('   • npm run local:db:push (push schema changes to database)');
      console.error('   • npm run local:migrate (run migrations)');
    }
    
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { createSampleData };
