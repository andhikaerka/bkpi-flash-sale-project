export interface IPurchaseRepository {
  create(userId: string, productId: string): Promise<void>;
  findAllByProductId(productId: string): Promise<{ userId: string }[]>;
}
