import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function testService() {
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1; // January = 1
  const currentYear = currentDate.getFullYear(); // 2026

  console.log(`📅 Testing for month ${currentMonth}/${currentYear}`);

  // Exact logic from InventoryService.getAllCurrentStock()
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

  console.log(`\n📊 Found ${categories.length} categories\n`);

  // Map categories to result format
  const result = categories.map(category => {
    const items = category.medicines.map(medicine => {
      const inventory = medicine.inventoryBalances[0];

      if (!inventory) {
        // Return empty inventory
        return {
          id: `temp-${medicine.id}`,
          medicineId: medicine.id,
          medicine: {
            ...medicine,
            category
          },
          month: currentMonth,
          year: currentYear,
          openingQuantity: 0,
          closingQuantity: 0,
        };
      }

      return {
        ...inventory,
        medicine: {
          ...medicine,
          category
        }
      };
    });

    return {
      category: {
        id: category.id,
        code: category.code,
        name: category.name,
        sortOrder: category.sortOrder
      },
      itemsCount: items.length
    };
  });

  // Print results
  result.forEach(group => {
    console.log(`${group.category.code} - ${group.category.name}: ${group.itemsCount} items`);
  });

  await prisma.$disconnect();
}

testService();
