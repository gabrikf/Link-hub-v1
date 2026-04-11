import { db } from "./index.js";
import { skillsCatalog, titlesCatalog } from "./schema.js";

const DEFAULT_SKILLS = [
  "React",
  "Node",
  "TypeScript",
  "JavaScript",
  "C#",
  "Next.js",
  "Express",
  "NestJS",
  "PostgreSQL",
  "Docker",
];

const DEFAULT_TITLES = [
  "Fullstack Engineer",
  "Frontend Engineer",
  "Backend Engineer",
  "Software Engineer",
  "Tech Lead",
];

function normalizeCatalogName(value: string) {
  return value.trim().toLowerCase();
}

async function seedSkills() {
  for (const skillName of DEFAULT_SKILLS) {
    await db
      .insert(skillsCatalog)
      .values({
        name: skillName,
        normalizedName: normalizeCatalogName(skillName),
        isDefault: true,
      })
      .onConflictDoNothing({ target: skillsCatalog.normalizedName });
  }
}

async function seedTitles() {
  for (const titleName of DEFAULT_TITLES) {
    await db
      .insert(titlesCatalog)
      .values({
        name: titleName,
        normalizedName: normalizeCatalogName(titleName),
        isDefault: true,
      })
      .onConflictDoNothing({ target: titlesCatalog.normalizedName });
  }
}

async function main() {
  await seedSkills();
  await seedTitles();

  console.log("Seed completed successfully");
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
