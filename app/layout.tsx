import type { Metadata } from 'next';
import './globals.css';
import './employees.css';
export const metadata: Metadata = {title:'Workspace · AI Xccelerate',description:'Your people, knowledge, and AI. Working together.',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="en"><body>{children}</body></html>}
