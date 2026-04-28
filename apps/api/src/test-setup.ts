/**
 * Vitest global setup — runs before each test file, before any module is imported.
 * Ensures process.env is populated from .env before the DI container is configured.
 */
import "dotenv/config";
