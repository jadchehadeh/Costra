import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
export type TokenPayload={userId:string;role:string;permissions:string[]};
export const signToken=(p:TokenPayload)=>jwt.sign(p,config.JWT_SECRET,{expiresIn:'8h'});
export function authenticate(req:Request,res:Response,next:NextFunction){
  const value=req.headers.authorization;
  if(!value?.startsWith('Bearer ')) return res.status(401).json({error:{code:'UNAUTHENTICATED',message:'Sign in is required.'}});
  try { req.auth=jwt.verify(value.slice(7),config.JWT_SECRET) as TokenPayload; next(); }
  catch { res.status(401).json({error:{code:'INVALID_TOKEN',message:'Your session is invalid or expired.'}}); }
}
export const requirePermission=(permission:string)=>(req:Request,res:Response,next:NextFunction)=>
  req.auth?.permissions.includes(permission)?next():res.status(403).json({error:{code:'FORBIDDEN',message:'You do not have permission to perform this action.'}});
