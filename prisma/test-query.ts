import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function test() {
  const currentMonth = 1;
  const currentYear = 2026;
  
  // Test exact query from service
  const categories = await prisma.medicineCategory.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    include: {
      medicines: {
        where: { isActive: true },
        orderBy: { name: 'asc' },
        include: {
          inventoryBalances: {
            where: {
              month: currentMonth,
              year: currentYear
            }
          }
        }
      }
    }
  });

  console.log('📊 Query Results:');
  console.log('Total categories:', categories.length);
  
  categories.slice(0, 3).forEach(cat => {
    console.log(`\n${cat.code} - ${cat.name}:`);
    console.log(`  Medicines count: ${cat.medicines.length}`);
    
    cat.medicines.slice(0, 2).forEach(med => {
      console.log(`  - ${med.name}:`);
      console.log(`    categoryId: ${med.categoryId}`);
      console.log(`    inventoryBalances: ${med.inventoryBalances.length} records`);
      if (med.inventoryBalances[0]) {
        console.log(`    Opening Qty: ${med.inventoryBalances[0].openingQuantity}`);
      }
    });
  });
  
  await prisma.$disconnect();
}

test();
