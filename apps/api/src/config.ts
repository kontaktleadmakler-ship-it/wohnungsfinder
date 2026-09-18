import 'dotenv/config';
import { z } from 'zod';
const schema = z.object({
  PORT: z.coerce.number().default(4000), MONGODB_URI: z.string().min(1), JWT_SECRET: z.string().min(32),
  FRONTEND_URL: z.string().url(), DOCUMENT_MASTER_KEY_BASE64: z.string().min(40), S3_BUCKET: z.string().min(1),
  S3_REGION: z.string().min(1), S3_ENDPOINT: z.string().url().optional(), S3_ACCESS_KEY_ID: z.string().min(1), S3_SECRET_ACCESS_KEY: z.string().min(1)
});
export const env = schema.parse(process.env);
