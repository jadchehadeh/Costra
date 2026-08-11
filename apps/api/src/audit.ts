import type { Request } from 'express';
import { db } from './db.js';
export async function audit(req:Request,data:{action:string;entity:string;entityId?:string;oldValue?:unknown;newValue?:unknown}){
  await db.auditLog.create({data:{...data,userId:req.auth?.userId,ipAddress:req.ip,sessionMetadata:{userAgent:req.get('user-agent')}} as never});
}
