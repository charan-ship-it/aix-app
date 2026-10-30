import {randomBytes} from 'node:crypto';
import {writeFileSync,existsSync} from 'node:fs';
if(existsSync('.env')){console.log('.env already exists; left unchanged.');process.exit(0)}
const password=randomBytes(24).toString('hex');
writeFileSync('.env',`POSTGRES_PASSWORD=${password}\nDATABASE_URL=postgres://aix:${password}@localhost:55432/aix_workspace\nREDIS_URL=redis://localhost:56379\nBETTER_AUTH_SECRET=${randomBytes(32).toString('hex')}\nBETTER_AUTH_URL=http://localhost:4173\nCREDENTIAL_ENCRYPTION_KEY=${randomBytes(32).toString('hex')}\nUPLOAD_DIR=.data/uploads\n`,{mode:0o600,flag:'wx'});
console.log('Created private .env with fresh local secrets.');
