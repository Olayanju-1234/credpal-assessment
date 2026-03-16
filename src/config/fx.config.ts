import { registerAs } from '@nestjs/config';

export default registerAs('fx', () => ({
  apiUrl: process.env.FX_API_URL || 'https://v6.exchangerate-api.com/v6',
  apiKey: process.env.FX_API_KEY || '',
  cacheTtlSeconds: parseInt(process.env.FX_CACHE_TTL || '300', 10),
  spreadPercent: process.env.FX_SPREAD_PERCENT || '1.5',
}));
