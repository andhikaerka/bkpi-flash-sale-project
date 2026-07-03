export interface ProductConfig {
  id: string;
  name: string;
  startTime: Date;
  endTime: Date;
  initialStock: number;
  currentStock: number;
}

export interface IProductRepository {
  findById(id: string): Promise<ProductConfig | null>;
  updateConfig(id: string, startTime: Date, endTime: Date): Promise<void>;
  upsert(config: ProductConfig): Promise<void>;
}
