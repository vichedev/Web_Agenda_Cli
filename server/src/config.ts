import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().default(4000),
  TZ_APP: z.string().default('America/Guayaquil'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  JWT_SECRET: z.string().min(16),
  ADMIN_USER: z.string().min(1),
  ADMIN_PASSWORD: z.string().min(1),
  GROQ_API_KEY: z.string().default(''),
  GROQ_CHAT_MODEL: z.string().default('openai/gpt-oss-120b'),
  GROQ_STT_MODEL: z.string().default('whisper-large-v3-turbo'),
  WA_AUTH_DIR: z.string().default('wa-auth'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Configuracion invalida (.env):', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
