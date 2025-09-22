import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

// Initialize PrismaClient
const prisma = new PrismaClient({
  log: ['error', 'warn', 'info']
});

// Sample data for workers (without hardcoded IDs)
const SAMPLE_WORKERS = [
  // Leaders
  { 
    employeeCode: 'NV5001', 
    firstName: 'Nguyễn', 
    lastName: 'Văn A', 
    phone: '0912345678', 
    email: 'vana@tbsgroup.vn', 
    role: Role.USER
  },
  { 
    employeeCode: 'NV5002', 
    firstName: 'Trần', 
    lastName: 'Thị B', 
    phone: '0987654321', 
    email: 'tb@tbsgroup.vn', 
    role: Role.USER
  },
  { 
    employeeCode: 'NV5003', 
    firstName: 'Lê', 
    lastName: 'Văn C', 
    phone: '0911223344', 
    email: 'vanc@tbsgroup.vn', 
    role: Role.USER
  },
  { 
    employeeCode: 'NV5004', 
    firstName: 'Phạm', 
    lastName: 'Thị D', 
    phone: '0988776655', 
    email: 'td@tbsgroup.vn', 
    role: Role.USER
  },

  // Workers
  { 
    employeeCode: 'NV5005', 
    firstName: 'Nguyễn', 
    lastName: 'Văn E', 
    phone: '0912345679', 
    email: 'vane@tbsgroup.vn', 
    role: Role.WORKER
  },
  { 
    employeeCode: 'NV5006', 
    firstName: 'Trần', 
    lastName: 'Thị F', 
    phone: '0987654322', 
    email: 'tf@tbsgroup.vn', 
    role: Role.WORKER
  },
  { 
    employeeCode: 'NV5007', 
    firstName: 'Lê', 
    lastName: 'Văn G', 
    phone: '0911223345', 
    email: 'vang@tbsgroup.vn', 
    role: Role.WORKER
  },
  { 
    employeeCode: 'NV5008', 
    firstName: 'Phạm', 
    lastName: 'Thị H', 
    phone: '0988776656', 
    email: 'th@tbsgroup.vn', 
    role: Role.WORKER
  },
  { 
    employeeCode: 'NV5009', 
    firstName: 'Nguyễn', 
    lastName: 'Văn I', 
    phone: '0912345680', 
    email: 'vani@tbsgroup.vn', 
    role: Role.WORKER
  },
  { 
    employeeCode: 'NV5010', 
    firstName: 'Trần', 
    lastName: 'Thị J', 
    phone: '0987654323', 
    email: 'tj@tbsgroup.vn', 
    role: Role.WORKER
  },
  { 
    employeeCode: 'NV5011', 
    firstName: 'Lê', 
    lastName: 'Văn K', 
    phone: '0911223346', 
    email: 'vank@tbsgroup.vn', 
    role: Role.WORKER
  },
  { 
    employeeCode: 'NV5012', 
    firstName: 'Phạm', 
    lastName: 'Thị L', 
    phone: '0988776657', 
    email: 'tl@tbsgroup.vn', 
    role: Role.WORKER
  },
  { 
    employeeCode: 'NV5013', 
    firstName: 'Nguyễn', 
    lastName: 'Văn M', 
    phone: '0912345681', 
    email: 'vanm@tbsgroup.vn', 
    role: Role.WORKER
  },
  { 
    employeeCode: 'NV5014', 
    firstName: 'Trần', 
    lastName: 'Thị N', 
    phone: '0987654324', 
    email: 'tn@tbsgroup.vn', 
    role: Role.WORKER
  },
  { 
    employeeCode: 'NV5015', 
    firstName: 'Lê', 
    lastName: 'Văn O', 
    phone: '0911223347', 
    email: 'vano@tbsgroup.vn', 
    role: Role.WORKER
  },
  { 
    employeeCode: 'NV5016', 
    firstName: 'Phạm', 
    lastName: 'Thị P', 
    phone: '0988776658', 
    email: 'tp@tbsgroup.vn', 
    role: Role.WORKER
  },
  { 
    employeeCode: 'NV5017', 
    firstName: 'Nguyễn', 
    lastName: 'Văn Q', 
    phone: '0912345682', 
    email: 'vanq@tbsgroup.vn', 
    role: Role.WORKER
  },
  { 
    employeeCode: 'NV5018', 
    firstName: 'Trần', 
    lastName: 'Thị R', 
    phone: '0987654325', 
    email: 'tr@tbsgroup.vn', 
    role: Role.WORKER
  },
  { 
    employeeCode: 'NV5019', 
    firstName: 'Lê', 
    lastName: 'Văn S', 
    phone: '0911223348', 
    email: 'vans@tbsgroup.vn', 
    role: Role.WORKER
  },
  { 
    employeeCode: 'NV5020', 
    firstName: 'Phạm', 
    lastName: 'Thị T', 
    phone: '0988776659', 
    email: 'tt@tbsgroup.vn', 
    role: Role.WORKER
  }
];

async function createSampleWorkers() {
  console.log('👷 Creating sample workers...');
  
  // First, get available job positions and offices
  const jobPositions = await prisma.jobPosition.findMany({
    where: { isActive: true },
    include: { 
      position: true, 
      office: true 
    }
  });
  
  if (jobPositions.length === 0) {
    console.error('❌ No job positions found. Please run the manufacturing data script first to create job positions.');
    return;
  }
  
  // Separate job positions by role type
  const leaderJobPositions = jobPositions.filter(jp => 
    jp.position.name.toLowerCase().includes('tổ trưởng') || 
    jp.position.name.toLowerCase().includes('trưởng') ||
    jp.position.name.toLowerCase().includes('leader')
  );
  const workerJobPositions = jobPositions.filter(jp => 
    jp.position.name.toLowerCase().includes('công nhân') || 
    jp.position.name.toLowerCase().includes('nhân viên') ||
    jp.position.name.toLowerCase().includes('worker')
  );
  
  console.log(`📋 Found ${leaderJobPositions.length} leader positions and ${workerJobPositions.length} worker positions`);
  
  for (let i = 0; i < SAMPLE_WORKERS.length; i++) {
    const workerData = SAMPLE_WORKERS[i];
    try {
      // Check if worker already exists
      const existingWorker = await prisma.user.findUnique({
        where: { employeeCode: workerData.employeeCode }
      });
      
      if (existingWorker) {
        console.warn(`⚠️ Worker already exists: ${workerData.employeeCode}`);
        continue;
      }
      
      // Select appropriate job position based on role
      let selectedJobPosition;
      if (workerData.role === Role.USER && leaderJobPositions.length > 0) {
        selectedJobPosition = leaderJobPositions[i % leaderJobPositions.length];
      } else if (workerJobPositions.length > 0) {
        selectedJobPosition = workerJobPositions[i % workerJobPositions.length];
      } else {
        // Fallback to any job position if specific role positions not found
        selectedJobPosition = jobPositions[i % jobPositions.length];
      }
      
      // Create worker
      const worker = await prisma.user.create({
        data: {
          ...workerData,
          password: await bcrypt.hash('123456', 10), // Default password
          role: workerData.role || Role.WORKER, // Default to WORKER role
          jobPositionId: selectedJobPosition.id,
          officeId: selectedJobPosition.officeId,
        },
      });
      
      console.log(`✅ Created worker: ${worker.employeeCode} - ${worker.firstName} ${worker.lastName}`);
    } catch (error) {
      console.error(`❌ Error creating worker ${workerData.employeeCode}:`, error.message);
    }
  }
}

async function assignWorkersToGroups(workers: any[]) {
  console.log('\n👥 Assigning workers to groups...');
  
  // Shuffle workers array for random assignment
  const shuffledWorkers = workers.sort(() => 0.5 - Math.random());
  
  // Assign workers to groups (1 leader + 4 workers per group)
  for (let i = 0; i < shuffledWorkers.length; i++) {
    const worker = shuffledWorkers[i];
    
    try {
      // Find a group to assign (1 leader + 4 workers per group)
      const group = await prisma.group.findFirst({
        where: {
          isActive: true,
          leaderId: null, // Group must not have a leader yet
        },
        orderBy: {
          createdAt: 'asc', // Assign to oldest group first
        },
      });
      
      if (!group) {
        console.warn('⚠️ No available groups for assignment');
        break;
      }
      
      // Update worker with group assignment
      await prisma.user.update({
        where: { id: worker.id },
        data: { groupId: group.id },
      });
      
      console.log(`✅ Assigned ${worker.employeeCode} to group ${group.code}`);
      
      // After assigning a leader, skip the next 4 workers (assuming 4 workers per group)
      if (i % 5 === 4) {
        console.log('--- Skipped 4 workers, next group leader assignment ---');
        i += 4;
      }
    } catch (error) {
      console.error(`❌ Error assigning worker ${worker.employeeCode} to group:`, error.message);
    }
  }
}

// Run script
async function main() {
  try {
    // Create sample workers
    await createSampleWorkers();
    
    // Get all workers for assignment
    const allWorkers = await prisma.user.findMany({
      where: { role: Role.WORKER },
      include: { group: true }
    });
    
    // Assign workers to groups
    await assignWorkersToGroups(allWorkers);
    
    console.log('\n🎉 Sample workers creation and assignment completed successfully!');
  } catch (error) {
    console.error('❌ Error in sample workers script:', error.message);
    
    // Provide helpful error message for common issues
    if (error.message.includes('foreign key constraint') || error.message.includes('jobPositionId')) {
      console.error('\n🔧 Foreign Key Constraint Issue Detected:');
      console.error('   Job positions may not exist in the database yet.');
      console.error('   Please run the manufacturing data script first:');
      console.error('   • npm run local:import:manufacturing');
      console.error('   Or run the complete setup:');
      console.error('   • npm run local:setup');
    }
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { createSampleWorkers, assignWorkersToGroups };