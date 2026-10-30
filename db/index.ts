import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';
const globalDb=globalThis as unknown as {aixSql?:ReturnType<typeof postgres>};
export function getSql(){if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required.');return globalDb.aixSql??=postgres(process.env.DATABASE_URL,{max:10,idle_timeout:20,connect_timeout:10,prepare:false})}
export function getDb(){return drizzle(getSql(),{schema})}
