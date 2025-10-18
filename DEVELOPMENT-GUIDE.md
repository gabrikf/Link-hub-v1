# 🚀 Development Scripts Guide

This guide explains all available npm scripts in the LinkHub monorepo.

## 📦 Understanding the Monorepo

Your project uses:

- **Turborepo** - Manages the monorepo and caching
- **npm workspaces** - Links packages together
- **TypeScript** - All packages need to be built

### Important: When to Rebuild Packages

When you change `@repo/schemas` or any shared package:

```bash
npm run rebuild:schemas   # Rebuild schemas package
```

The API will automatically pick up the changes because it's linked via workspaces!

---

## 🎯 Most Common Commands

### Development (Daily Use)

```bash
# Start EVERYTHING (API + Web + all packages)
npm run dev

# Start ONLY the backend API (port 3333)
npm run dev:api

# Start ONLY the frontend web (port 3000)
npm run dev:web

# Watch & rebuild schemas package (when actively changing schemas)
npm run dev:schemas

# Start API + Web in parallel (no packages watching)
npm run dev:all
```

### Building

```bash
# Build everything (packages + apps)
npm run build

# Build only API
npm run build:api

# Build only Web
npm run build:web

# Rebuild schemas (clean + build)
npm run rebuild:schemas
```

---

## 🗄️ Database Commands

### Drizzle Studio (Visual Database Editor)

```bash
# Open Drizzle Studio in your browser
npm run db:studio
```

Opens at: `https://local.drizzle.studio`

### Schema Changes & Migrations

```bash
# 1. After changing schema.ts, generate migration
npm run db:generate

# 2. Apply migrations to database
npm run db:migrate

# OR: Push schema directly (no migrations - dev only)
npm run db:push
```

### Database Reset & Seed

```bash
# Reset database (drop all tables and recreate)
npm run db:reset

# Seed database with test data
npm run db:seed
```

**Note:** These use your `db-manage.sh` script.

---

## 🧪 Testing

```bash
# Run all tests once
npm test

# Run API tests only
npm run test:api

# Watch mode (re-run on file changes)
npm run test:watch

# Generate coverage report
npm run test:coverage
```

---

## 🛠️ Utility Commands

```bash
# Format all code with Prettier
npm run format

# Type-check all packages
npm run check-types

# Clean build caches
npm run clean

# Nuclear option: Delete all node_modules and build artifacts
npm run clean:all
```

---

## 📋 Workflow Examples

### Scenario 1: Changing Schemas

You're working on the API and need to change the auth schemas:

```bash
# Terminal 1: Watch & rebuild schemas automatically
npm run dev:schemas

# Terminal 2: Run API in watch mode
npm run dev:api

# Now changes to schemas automatically rebuild and API picks them up!
```

### Scenario 2: Full Stack Development

```bash
# Single command runs everything
npm run dev

# Or use separate terminals for better control:
# Terminal 1: API
npm run dev:api

# Terminal 2: Web
npm run dev:web

# Terminal 3: Database Studio (optional)
npm run db:studio
```

### Scenario 3: After Changing Database Schema

```bash
# 1. Edit apps/api/src/infra/database/drizzle/schema.ts
# ... make your changes ...

# 2. Generate migration
npm run db:generate

# 3. Apply to database
npm run db:migrate

# 4. Verify in Drizzle Studio
npm run db:studio
```

### Scenario 4: Fresh Setup / Reset Everything

```bash
# 1. Clean everything
npm run clean:all

# 2. Reinstall dependencies
npm install

# 3. Build all packages
npm run build

# 4. Reset & seed database
npm run db:reset
npm run db:seed

# 5. Start development
npm run dev
```

---

## 🎨 Quick Reference Table

| Task             | Command                   | When to Use          |
| ---------------- | ------------------------- | -------------------- |
| Start dev server | `npm run dev`             | Daily development    |
| Backend only     | `npm run dev:api`         | Working on API       |
| Frontend only    | `npm run dev:web`         | Working on UI        |
| View database    | `npm run db:studio`       | Check DB data        |
| Reset database   | `npm run db:reset`        | Start fresh          |
| Run tests        | `npm run test:watch`      | Writing tests        |
| Rebuild schemas  | `npm run rebuild:schemas` | After schema changes |
| Format code      | `npm run format`          | Before committing    |

---

## 💡 Pro Tips

### 1. **Always rebuild schemas after changes**

```bash
# Quick command when schemas change:
npm run rebuild:schemas && npm run dev:api
```

### 2. **Use Turbo filtering for faster builds**

```bash
# Only build what changed since last commit
npm run build
```

### 3. **Database workflow**

```bash
# Development: Use push (faster)
npm run db:push

# Production: Use migrations (trackable)
npm run db:generate
npm run db:migrate
```

### 4. **Parallel terminals for productivity**

```bash
# Terminal 1: API
npm run dev:api

# Terminal 2: Web
npm run dev:web

# Terminal 3: Tests
npm run test:watch

# Terminal 4: DB Studio
npm run db:studio
```

---

## 🔧 Troubleshooting

### "Module not found: @repo/schemas"

**Solution:**

```bash
npm run rebuild:schemas
```

### "Schema doesn't match" errors

**Solution:**

```bash
# Rebuild schemas package
npm run rebuild:schemas

# Restart API
npm run dev:api
```

### Changes not reflecting

**Solution:**

```bash
# Hard reset
npm run clean
npm install
npm run build
npm run dev
```

### Database out of sync

**Solution:**

```bash
npm run db:reset    # Drops and recreates everything
npm run db:migrate  # OR apply migrations
```

---

## 📚 Additional Resources

- **Turborepo Docs**: https://turbo.build/repo/docs
- **Drizzle ORM**: https://orm.drizzle.team
- **npm Workspaces**: https://docs.npmjs.com/cli/v7/using-npm/workspaces

---

## 🎯 Summary

**For daily work:**

```bash
npm run dev              # Full stack
npm run dev:api          # Backend only
npm run dev:web          # Frontend only
npm run db:studio        # Database GUI
```

**When schemas change:**

```bash
npm run rebuild:schemas  # Then restart API
```

**Database changes:**

```bash
npm run db:generate      # Create migration
npm run db:migrate       # Apply migration
npm run db:reset         # Nuclear option
```

Happy coding! 🚀
