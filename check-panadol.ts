import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const medicine = await prisma.medicine.findFirst({
    where: { name: 'Panadol' },
    include: {
      inventoryBalances: {
        where: { month: 1, year: 2026 },
        orderBy: { createdAt: 'desc' },
        take: 1
      }
    }
  })
  
  console.log('=== PANADOL MEDICINE DATA ===')
  if (!medicine) {
    console.log('Medicine not found!')
  } else {
    console.log(`Medicine ID: ${medicine.id}`)
    console.log(`Medicine Name: ${medicine.name}`)
    if (medicine.inventoryBalances.length > 0) {
      const inv = medicine.inventoryBalances[0]
      console.log('\n=== INVENTORY DATA FOR JANUARY 2026 ===')
      console.log(`Opening Quantity: ${inv.openingQuantity}`)
      console.log(`Opening Unit Price: ${inv.openingUnitPrice}`)
      console.log(`Opening Total Amount: ${inv.openingTotalAmount}`)
      console.log(`Closing Quantity: ${inv.closingQuantity}`)
      console.log(`Closing Unit Price: ${inv.closingUnitPrice}`)
      console.log(`Closing Total Amount: ${inv.closingTotalAmount}`)
      console.log(`\nTypes:`)
      console.log(`  openingTotalAmount type: ${typeof inv.openingTotalAmount}`)
      console.log(`  closingTotalAmount type: ${typeof inv.closingTotalAmount}`)
    } else {
      console.log('No inventory data for January 2026')
    }
  }
  
  await prisma.$disconnect()
}

main().catch(console.error)
