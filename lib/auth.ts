import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { organization } from 'better-auth/plugins';
import { getDb } from '@/db';
import * as schema from '@/db/schema';
import { getRedis } from '@/lib/server/redis';
let instance:ReturnType<typeof createAuth>|undefined;
function createAuth(){if(!process.env.BETTER_AUTH_SECRET)throw new Error('BETTER_AUTH_SECRET is required.');return betterAuth({appName:'AI Xccelerate',baseURL:process.env.BETTER_AUTH_URL,secret:process.env.BETTER_AUTH_SECRET,database:drizzleAdapter(getDb(),{provider:'pg',schema}),emailAndPassword:{enabled:true,minPasswordLength:12},plugins:[organization({allowUserToCreateOrganization:true,creatorRole:'owner',organizationLimit:10})],secondaryStorage:{getAndDelete:async key=>getRedis().getdel('auth:'+key),increment:async(key,ttl)=>Number(await getRedis().eval("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n",1,'auth:'+key,ttl)),get:async key=>getRedis().get('auth:'+key),set:async(key,value,ttl)=>{if(ttl)await getRedis().set('auth:'+key,value,'EX',ttl);else await getRedis().set('auth:'+key,value)},delete:async key=>{await getRedis().del('auth:'+key)}},rateLimit:{enabled:true,storage:'secondary-storage',window:60,max:60}})}
export function getAuth(){return instance??=createAuth()}
