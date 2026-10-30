import {defineConfig} from 'drizzle-kit';
export default defineConfig({out:'./postgres-migrations',schema:'./db/schema.ts',dialect:'postgresql',dbCredentials:{url:process.env.DATABASE_URL||'postgres://localhost/aix'}});
