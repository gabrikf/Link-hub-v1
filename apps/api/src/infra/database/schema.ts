import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  login: text("login").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  avatarUrl: text("avatar_url"),
  password: text("password"),
  googleId: text("google_id").unique(),
  created_at: timestamp("created_at").notNull().defaultNow(),
  updated_at: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdateFn(() => new Date()),
});
