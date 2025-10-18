import { FastifyInstance } from "fastify";
import { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../infra/database/drizzle/schema.ts";

declare module "fastify" {
  interface FastifyInstance {
    db: PostgresJsDatabase<typeof schema>;
  }
}
