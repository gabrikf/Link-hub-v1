import { db } from "./index.js";
import { skillsCatalog, titlesCatalog } from "./schema.js";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_SKILLS,
  DEFAULT_TITLES,
  normalizeCatalogName,
} from "./seed-catalog-data.js";

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

export async function seedDefaultCatalog() {
  await seedSkills();
  await seedTitles();
}

async function main() {
  await seedDefaultCatalog();

  console.log("Seed completed successfully");
}

const currentFile = fileURLToPath(import.meta.url);

if (process.argv[1] === currentFile) {
  main().catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  });
}
