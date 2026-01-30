import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, getPool } from '../server/config/database.js';
import { logger } from '../server/utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Database migration runner
 */

// Create schema_versions table if it doesn't exist
async function ensureSchemaVersionsTable() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS schema_versions (
        version INTEGER PRIMARY KEY,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (error) {
    logger.error('Error creating schema_versions table', { error: error.message });
    throw error;
  }
}

// Get current schema version
async function getCurrentVersion() {
  try {
    const result = await query('SELECT MAX(version) as version FROM schema_versions');
    return result.rows[0]?.version || 0;
  } catch (error) {
    // Table doesn't exist yet
    return 0;
  }
}

// Record migration
async function recordMigration(version) {
  await query(
    'INSERT INTO schema_versions (version) VALUES ($1)',
    [version]
  );
}

// Get migration files
function getMigrationFiles() {
  const migrationsDir = path.join(__dirname, '../server/db/migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort();

  return files.map(file => ({
    version: parseInt(file.match(/^(\d+)_/)?.[1] || '0', 10),
    filename: file,
    path: path.join(migrationsDir, file)
  }));
}

// Run migration
async function runMigration(migration) {
  logger.info(`Running migration ${migration.filename}`, { version: migration.version });

  const sql = fs.readFileSync(migration.path, 'utf8');

  // Split by semicolons and execute each statement
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  for (const statement of statements) {
    if (statement.trim()) {
      await query(statement);
    }
  }

  await recordMigration(migration.version);
  logger.info(`Migration ${migration.filename} completed`, { version: migration.version });
}

// Main migration function
async function migrate() {
  try {
    logger.info('Starting database migrations...');

    // Ensure schema_versions table exists
    await ensureSchemaVersionsTable();

    // Get current version
    const currentVersion = await getCurrentVersion();
    logger.info(`Current schema version: ${currentVersion}`);

    // Get migration files
    const migrations = getMigrationFiles();
    logger.info(`Found ${migrations.length} migration files`);

    // Filter migrations that need to run
    const pendingMigrations = migrations.filter(m => m.version > currentVersion);

    if (pendingMigrations.length === 0) {
      logger.info('Database is up to date');
      return;
    }

    logger.info(`Running ${pendingMigrations.length} pending migrations...`);

    // Run migrations in order
    for (const migration of pendingMigrations) {
      try {
        await runMigration(migration);
      } catch (error) {
        logger.error(`Migration ${migration.filename} failed`, {
          error: error.message,
          stack: error.stack
        });
        throw error;
      }
    }

    logger.info('All migrations completed successfully');

  } catch (error) {
    logger.error('Migration failed', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  } finally {
    await getPool().end();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrate();
}

export { migrate };

