import { PrismaClient } from '@prisma/client';
import { IPurchaseRepository } from '../../domain/repositories/IPurchaseRepository';

export class PrismaPurchaseRepository implements IPurchaseRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(userId: string, productId: string): Promise<void> {
    await this.prisma.purchase.create({
      data: { user_id: userId, product_id: productId },
    });
  }

  async findAllByProductId(productId: string): Promise<{ userId: string }[]> {
    const purchases = await this.prisma.purchase.findMany({
      where: { product_id: productId },
      select: { user_id: true },
    });

    return purchases.map((p) => ({ userId: p.user_id }));
  }
}
