import { PrismaClient } from '@prisma/client';
import { IProductRepository, ProductConfig } from '../../domain/repositories/IProductRepository';

export class PrismaProductRepository implements IProductRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<ProductConfig | null> {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) return null;

    return {
      id: product.id,
      name: product.name,
      startTime: product.start_time,
      endTime: product.end_time,
      initialStock: product.initial_stock,
      currentStock: product.current_stock,
    };
  }

  async updateConfig(id: string, startTime: Date, endTime: Date): Promise<void> {
    await this.prisma.product.update({
      where: { id },
      data: { start_time: startTime, end_time: endTime },
    });
  }

  async upsert(config: ProductConfig): Promise<void> {
    await this.prisma.product.upsert({
      where: { id: config.id },
      update: {
        current_stock: config.currentStock,
        start_time: config.startTime,
        end_time: config.endTime,
      },
      create: {
        id: config.id,
        name: config.name,
        initial_stock: config.initialStock,
        current_stock: config.currentStock,
        start_time: config.startTime,
        end_time: config.endTime,
      },
    });
  }
}
