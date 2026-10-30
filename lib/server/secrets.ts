import { and,eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { credentials } from '@/db/schema';
import { AppError } from './http';
import { composioPlatformConfig } from './composio-config';
export type Provider='anthropic'|'openai'|'composio';
const encode=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes));
const decode=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function key(){if(!process.env.CREDENTIAL_ENCRYPTION_KEY)throw new AppError(503,'Secure key storage is not configured. Contact the workspace owner.');return crypto.subtle.importKey('raw',decode(process.env.CREDENTIAL_ENCRYPTION_KEY),'AES-GCM',false,['encrypt','decrypt'])}
export async function seal(value:string,owner:string,provider:string){const iv=crypto.getRandomValues(new Uint8Array(12));const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(owner+':'+provider)},await key(),new TextEncoder().encode(value));return encode(iv)+'.'+encode(new Uint8Array(encrypted))}
export async function secret(owner:string,provider:Provider){if(provider==='composio')return composioPlatformConfig().apiKey;const [row]=await getDb().select().from(credentials).where(and(eq(credentials.organizationId,owner),eq(credentials.provider,provider))).limit(1);if(row)return unseal(row.ciphertext,owner,provider);return process.env.ALLOW_SHARED_PROVIDER_KEYS==='true'?(provider==='anthropic'?process.env.ANTHROPIC_API_KEY:provider==='openai'?process.env.OPENAI_API_KEY:process.env.COMPOSIO_API_KEY):undefined}
export async function connectionSettings(owner:string){const rows=await getDb().select({provider:credentials.provider,lastFour:credentials.lastFour,models:credentials.models,updatedAt:credentials.updatedAt}).from(credentials).where(eq(credentials.organizationId,owner));return {secureStorage:!!process.env.CREDENTIAL_ENCRYPTION_KEY,providers:(['anthropic','openai'] as const).map(provider=>{const row=rows.find(r=>r.provider===provider);const fromEnv=process.env.ALLOW_SHARED_PROVIDER_KEYS==='true'&&(provider==='anthropic'?!!process.env.ANTHROPIC_API_KEY:provider==='openai'?!!process.env.OPENAI_API_KEY:!!process.env.COMPOSIO_API_KEY);return {provider,configured:!!row||fromEnv,source:row?'personal':fromEnv?'server':'none',lastFour:row?.lastFour,models:row?row.models:[],updatedAt:row?.updatedAt}})}}

export async function unseal(ciphertext:string,owner:string,provider:string){const [iv,data]=ciphertext.split('.');return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(iv),additionalData:new TextEncoder().encode(owner+':'+provider)},await key(),decode(data)))}
