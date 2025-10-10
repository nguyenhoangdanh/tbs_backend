// prisma/seed.ts
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const medicines = [
  { name: "Aciclovir / Medskin Clovir", dosage: 0, strength: "400mg", frequency: "", instructions: "", units: "viên" },
  { name: "Aciclovir bôi ngoài da", dosage: 0, strength: "5%", frequency: "", instructions: "", units: "tuýp" },
  { name: "Amoxicillin", dosage: 0, strength: "500mg", frequency: "", instructions: "", units: "viên" },
  { name: "Protamol / Agiprofen", dosage: 0, strength: "", frequency: "", instructions: "", units: "viên" },
  { name: "Alphachymotrypsin", dosage: 0, strength: "", frequency: "", instructions: "", units: "viên" },
  { name: "Spacmarizine", dosage: 0, strength: "40mg", frequency: "", instructions: "", units: "viên" },
  { name: "Acetylcystein", dosage: 0, strength: "200mg", frequency: "", instructions: "", units: "viên" },
  { name: "Vitamin C", dosage: 0, strength: "500mg", frequency: "", instructions: "", units: "viên" },
  { name: "Folic-Fe / Agifivit", dosage: 0, strength: "", frequency: "", instructions: "", units: "viên" },
  { name: "Bromhexin (Bixovom)", dosage: 0, strength: "8mg", frequency: "", instructions: "", units: "viên" },
  { name: "Cephalexin", dosage: 0, strength: "500mg", frequency: "", instructions: "", units: "viên" },
  { name: "Coldacmin", dosage: 0, strength: "", frequency: "", instructions: "", units: "viên" },
  { name: "Chlorpheniramin", dosage: 0, strength: "4mg", frequency: "", instructions: "", units: "viên" },
  { name: "Cetirizin", dosage: 0, strength: "", frequency: "", instructions: "", units: "viên" },
  { name: "Cinnarizin", dosage: 0, strength: "", frequency: "", instructions: "", units: "viên" },
  { name: "Calcium Hasan", dosage: 0, strength: "500mg", frequency: "", instructions: "", units: "viên" },
  { name: "Vitamin C sủi", dosage: 0, strength: "1000mg", frequency: "", instructions: "", units: "viên" },
  { name: "Calci D", dosage: 0, strength: "", frequency: "", instructions: "", units: "viên" },
  { name: "Carbomango", dosage: 0, strength: "", frequency: "", instructions: "", units: "viên" },
  { name: "Cimetidin", dosage: 0, strength: "300mg", frequency: "", instructions: "", units: "viên" },
  { name: "Ciprofloxacin (Vidiphar)", dosage: 0, strength: "0.3% / 5ml", frequency: "", instructions: "", units: "chai" },
  { name: "Domitazol", dosage: 0, strength: "", frequency: "", instructions: "", units: "viên" },
  { name: "Diclofenac", dosage: 0, strength: "", frequency: "", instructions: "", units: "viên" },
  { name: "Decontapp Pharco", dosage: 0, strength: "250mg", frequency: "", instructions: "", units: "viên" },
  { name: "Dextromethorphan / Vacotexphan", dosage: 0, strength: "", frequency: "", instructions: "", units: "viên" },
  { name: "Domperidon (Mutecium-M)", dosage: 0, strength: "", frequency: "", instructions: "", units: "viên" },
  { name: "Erythromycin (VDP)", dosage: 0, strength: "", frequency: "", instructions: "", units: "viên" },
  { name: "Eugica Fort", dosage: 0, strength: "", frequency: "", instructions: "", units: "viên" },
  { name: "Enpovid AD", dosage: 0, strength: "", frequency: "", instructions: "", units: "viên" },
  { name: "Gikanin / Tangynyl", dosage: 0, strength: "500mg", frequency: "", instructions: "", units: "viên" },
  { name: "Phosphalugel", dosage: 0, strength: "", frequency: "", instructions: "", units: "gói" },
  { name: "Hapacol", dosage: 0, strength: "650mg", frequency: "", instructions: "", units: "viên" },
  { name: "Levoogi", dosage: 0, strength: "5mg", frequency: "", instructions: "", units: "viên" },
  { name: "Loperamid", dosage: 0, strength: "2mg", frequency: "", instructions: "", units: "viên" },
  { name: "Neocin", dosage: 0, strength: "", frequency: "", instructions: "", units: "chai" },
  { name: "Methylprednisolon", dosage: 0, strength: "16mg", frequency: "", instructions: "", units: "viên" },
  { name: "Metronidazol", dosage: 0, strength: "250mg", frequency: "", instructions: "", units: "viên" },
  { name: "Meloxicam", dosage: 0, strength: "", frequency: "", instructions: "", units: "viên" },
  { name: "Mekocoramin", dosage: 0, strength: "", frequency: "", instructions: "", units: "viên" },
  { name: "Magnesi B6", dosage: 0, strength: "", frequency: "", instructions: "", units: "viên" },
  { name: "Ovac (Omeprazol)", dosage: 0, strength: "20mg", frequency: "", instructions: "", units: "viên" },
  { name: "Oresol Baby", dosage: 0, strength: "4.1g", frequency: "", instructions: "", units: "gói" },
  { name: "Prednisolon", dosage: 0, strength: "", frequency: "", instructions: "", units: "viên" },
  { name: "Paracetamol", dosage: 0, strength: "500mg", frequency: "", instructions: "", units: "viên" },
  { name: "Piracetam", dosage: 0, strength: "800mg", frequency: "", instructions: "", units: "viên" },
  { name: "Biolac", dosage: 0, strength: "", frequency: "", instructions: "", units: "viên" },
  { name: "Smecta", dosage: 0, strength: "", frequency: "", instructions: "", units: "gói" },
  { name: "Sorbitol", dosage: 0, strength: "", frequency: "", instructions: "", units: "gói" },
  { name: "Terpin-Codein / Terpinzoat", dosage: 0, strength: "", frequency: "", instructions: "", units: "viên" },
  { name: "Theralene / Toussolene", dosage: 0, strength: "5mg", frequency: "", instructions: "", units: "viên" },
  { name: "Tyrotab / Pasitussin", dosage: 0, strength: "", frequency: "", instructions: "", units: "viên" },
  { name: "Vitamin PP", dosage: 0, strength: "", frequency: "", instructions: "", units: "viên" },
  { name: "Vitamin B1-B6-B12", dosage: 0, strength: "", frequency: "", instructions: "", units: "viên" },
  { name: "Vitamin B1", dosage: 0, strength: "", frequency: "", instructions: "", units: "viên" },
  { name: "Hoạt huyết DN", dosage: 0, strength: "", frequency: "", instructions: "", units: "viên" },
  { name: "Amlodipin", dosage: 0, strength: "5mg", frequency: "", instructions: "", units: "viên" },
  { name: "Panadol", dosage: 0, strength: "500mg", frequency: "", instructions: "", units: "viên" },
  { name: "Cefuroxim", dosage: 0, strength: "500mg", frequency: "", instructions: "", units: "viên" },
  { name: "Ciprofloxacin", dosage: 0, strength: "500mg", frequency: "", instructions: "", units: "viên" },
  { name: "Cefixim", dosage: 0, strength: "200mg", frequency: "", instructions: "", units: "viên" },
  { name: "Captopril", dosage: 0, strength: "25mg", frequency: "", instructions: "", units: "viên" },
  { name: "Griseofulvin bôi ngoài da", dosage: 0, strength: "5%", frequency: "", instructions: "", units: "tuýp" },
  { name: "Tenoxicam", dosage: 0, strength: "20mg", frequency: "", instructions: "", units: "viên" },
  { name: "Loravidi (Loratadin)", dosage: 0, strength: "10mg", frequency: "", instructions: "", units: "viên" },
  { name: "Polydesone", dosage: 0, strength: "5ml", frequency: "", instructions: "", units: "chai" },
  { name: "Gentamycin", dosage: 0, strength: "0.3% / 5ml", frequency: "", instructions: "", units: "chai" },
  { name: "Natri Clorid 0.9%", dosage: 0, strength: "10ml", frequency: "", instructions: "", units: "chai" },
  { name: "Biosubtyl-II", dosage: 0, strength: "", frequency: "", instructions: "", units: "gói" },
  { name: "Silkeron", dosage: 0, strength: "", frequency: "", instructions: "", units: "tuýp" },
  { name: "Efferalgan", dosage: 0, strength: "500mg", frequency: "", instructions: "", units: "viên" },
  { name: "Klamentin", dosage: 0, strength: "1g", frequency: "", instructions: "", units: "viên" },
  { name: "Zaromax", dosage: 0, strength: "500mg", frequency: "", instructions: "", units: "viên" },
  { name: "Celecoxib", dosage: 0, strength: "200mg", frequency: "", instructions: "", units: "viên" },
  { name: "Dinalvic VPC", dosage: 0, strength: "", frequency: "", instructions: "", units: "viên" },
  { name: "Nidal", dosage: 0, strength: "", frequency: "", instructions: "", units: "viên" }
];

async function main() {
  for (const med of medicines) {
    await prisma.medicine.upsert({
      where: { name: med.name },
      update: {
        dosage: med.dosage,
        strength: med.strength,
        frequency: med.frequency,
        instructions: med.instructions,
        units: med.units,
        isActive: true,
      },
      create: med,
    });
  }
  console.log(`✅ Seeded ${medicines.length} medicines (frequency & instructions set to "" where unknown).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
