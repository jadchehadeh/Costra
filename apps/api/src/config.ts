import 'dotenv/config';
import { z } from 'zod';
export const config = z.object({
  DATABASE_URL:z.string().min(1), JWT_SECRET:z.string().min(32),
  PORT:z.coerce.number().default(3000), WEB_ORIGIN:z.string().default('http://localhost:5173')
}).parse(process.env);
