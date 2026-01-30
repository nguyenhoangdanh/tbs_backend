import { PrismaClient, MedicalItemType } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Seed medicine categories theo yêu cầu
 * - I-XIV, XVII: MEDICINE (Thuốc)
 * - XV: EMERGENCY_SUPPLY (Cấp cứu)
 * - XVI: MEDICAL_EQUIPMENT (Vật tư y tế)
 */
async function seedMedicineCategories() {
  console.log('🌱 Seeding medicine categories...');

  const categories = [
    {
      code: 'I',
      name: 'NHÓM THUỐC HẠ SỐT, GIẢM ĐAU, CHỐNG VIÊM KHÔNG STEROID',
      type: MedicalItemType.MEDICINE,
      sortOrder: 1,
    },
    {
      code: 'II',
      name: 'NHÓM THUỐC CHỐNG DỊ ỨNG',
      type: MedicalItemType.MEDICINE,
      sortOrder: 2,
    },
    {
      code: 'III',
      name: 'NHÓM THUỐC KHÁNG SINH',
      type: MedicalItemType.MEDICINE,
      sortOrder: 3,
    },
    {
      code: 'IV',
      name: 'NHÓM THUỐC KHÁNG VIRUS',
      type: MedicalItemType.MEDICINE,
      sortOrder: 4,
    },
    {
      code: 'V',
      name: 'NHÓM THUỐC CHỐNG NẤM',
      type: MedicalItemType.MEDICINE,
      sortOrder: 5,
    },
    {
      code: 'VI',
      name: 'NHÓM THUỐC TIM MẠCH- HUYẾT ÁP',
      type: MedicalItemType.MEDICINE,
      sortOrder: 6,
    },
    {
      code: 'VII',
      name: 'NHÓM THUỐC ĐƯỜNG TIÊU HÓA',
      type: MedicalItemType.MEDICINE,
      sortOrder: 7,
    },
    {
      code: 'VIII',
      name: 'NHÓM THUỐC CHỐNG VIÊM CORTICOID',
      type: MedicalItemType.MEDICINE,
      sortOrder: 8,
    },
    {
      code: 'IX',
      name: 'NHÓM THUỐC LÀM MỀM CƠ VÀ ỨC CHẾ  CHOLINESTERASE',
      type: MedicalItemType.MEDICINE,
      sortOrder: 9,
    },
    {
      code: 'X',
      name: 'NHÓM THUỐC TÁC ĐỘNG LÊN HỆ THẦN KINH',
      type: MedicalItemType.MEDICINE,
      sortOrder: 10,
    },
    {
      code: 'XI',
      name: 'NHÓM THUỐC TÁC DỤNG LÊN ĐƯỜNG HÔ HẤP',
      type: MedicalItemType.MEDICINE,
      sortOrder: 11,
    },
    {
      code: 'XII',
      name: 'NHÓM THUỐC VITAMIN VÀ KHOÁNG CHẤT',
      type: MedicalItemType.MEDICINE,
      sortOrder: 12,
    },
    {
      code: 'XIII',
      name: 'NHÓM THUỐC NHỎ MẮT, TAI MŨI HỌNG',
      type: MedicalItemType.MEDICINE,
      sortOrder: 13,
    },
    {
      code: 'XIV',
      name: 'NHÓM DÙNG NGOÀI',
      sortOrder: 14,
    },
    {
      code: 'XV',
      name: 'CẤP CỨU',
      type: MedicalItemType.EMERGENCY_SUPPLY,
      sortOrder: 15,
    },
    {
      code: 'XVI',
      name: 'NHÓM VẬT TƯ Y TẾ + DM TÚI CỨU THƯƠNG',
      type: MedicalItemType.MEDICAL_EQUIPMENT,
      sortOrder: 16,
    },
    {
      code: 'XVII',
      name: 'THUỐC CHỐNG SỐC THEO TT51/BYT.ĐƠN VỊ TÍNH CHO 01 HỘP',
      type: MedicalItemType.MEDICINE,
      sortOrder: 17,
    },
  ];

  for (const category of categories) {
    await prisma.medicineCategory.upsert({
      where: { code: category.code },
      update: {
        name: category.name,
        type: category.type,
        sortOrder: category.sortOrder,
      },
      create: category,
    });
  }

  console.log(`✅ Created/updated ${categories.length} medicine categories`);
}

async function main() {
  try {
    await seedMedicineCategories();
    console.log('🎉 Seed completed successfully!');
  } catch (error) {
    console.error('❌ Seed failed:', error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
