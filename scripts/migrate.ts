try { process.loadEnvFile(); } catch {}
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { getDb,getSql } from '../db';
async function main(){await getSql().unsafe('CREATE EXTENSION IF NOT EXISTS vector');await migrate(getDb(),{migrationsFolder:'postgres-migrations'});console.log('PostgreSQL migrations applied');await getSql().end()}
main().catch(()=>{console.error('Migration failed. Check DATABASE_URL, database access, and pgvector support.');process.exit(1)});
