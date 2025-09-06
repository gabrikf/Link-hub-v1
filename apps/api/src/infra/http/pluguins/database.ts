import { FastifyInstance, FastifyPluginOptions } from "fastify";
import fp from "fastify-plugin";
import { db } from "../../database/index.js";

// This function will be executed by Fastify to register the plugin
async function databasePlugin(fastify: FastifyInstance) {
  // Decorate the Fastify instance with our Drizzle instance
  fastify.decorate("db", db);
}

// Wrap the plugin with fastify-plugin to tell Fastify that
// this plugin's decorators should be available globally
export default fp(databasePlugin);
