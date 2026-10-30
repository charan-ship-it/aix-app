import {getSql} from '@/db';import {getRedis} from '@/lib/server/redis';
export const dynamic='force-dynamic';
export async function GET(){try{await Promise.all([getSql()`select 1`,getRedis().ping()]);return Response.json({status:'ready'})}catch{return Response.json({status:'unavailable'},{status:503})}}
