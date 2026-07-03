import { z } from 'zod';

export const purchaseSchema = z.object({
  userId: z.string().min(1),
  productId: z.string().min(1),
});

export const configSchema = z.object({
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
});
