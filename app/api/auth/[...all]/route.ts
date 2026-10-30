import { getAuth } from '@/lib/auth';
export const runtime='nodejs';
export async function GET(req:Request){return getAuth().handler(req)}
export async function POST(req:Request){return getAuth().handler(req)}
