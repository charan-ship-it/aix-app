import { mkdir,writeFile,unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { S3Client,PutObjectCommand,DeleteObjectCommand } from '@aws-sdk/client-s3';
function client(){return new S3Client({region:process.env.S3_REGION||'auto',endpoint:process.env.S3_ENDPOINT,forcePathStyle:true,credentials:process.env.S3_ACCESS_KEY_ID&&process.env.S3_SECRET_ACCESS_KEY?{accessKeyId:process.env.S3_ACCESS_KEY_ID,secretAccessKey:process.env.S3_SECRET_ACCESS_KEY}:undefined})}
export function sourceKey(org:string,id:string){return `${createHash('sha256').update(org).digest('hex')}/${createHash('sha256').update(id).digest('hex')}.txt`}
export async function storeSource(org:string,id:string,content:string){const key=sourceKey(org,id);if(process.env.S3_BUCKET){await client().send(new PutObjectCommand({Bucket:process.env.S3_BUCKET,Key:key,Body:content,ContentType:'text/plain; charset=utf-8'}))}else{if(process.env.NODE_ENV==='production'&&!process.env.UPLOAD_DIR)throw new Error('Configure S3_BUCKET or a persistent UPLOAD_DIR');const path=resolve(process.env.UPLOAD_DIR||'.data/uploads',key);await mkdir(resolve(path,'..'),{recursive:true});await writeFile(path,content,{mode:0o600})}return key}
export async function deleteSource(org:string,id:string){const key=sourceKey(org,id);if(process.env.S3_BUCKET)await client().send(new DeleteObjectCommand({Bucket:process.env.S3_BUCKET,Key:key}));else await unlink(resolve(process.env.UPLOAD_DIR||'.data/uploads',key)).catch(()=>{})}
