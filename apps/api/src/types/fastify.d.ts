import { FastifyInstance } from "fastify";
import { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../infra/database/schema.js";

declare module "fastify" {
  interface FastifyInstance {
    db: PostgresJsDatabase<typeof schema>;
  }
}
