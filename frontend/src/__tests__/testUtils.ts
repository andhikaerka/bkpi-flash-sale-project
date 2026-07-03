import { vi } from 'vitest';

export const mockFetch = vi.fn();

export const activeSaleResponse = {
  status: 'active',
  productId: 'flash-sale-product-id',
  remainingStock: 50,
  startTime: new Date(Date.now() - 600000).toISOString(),
  endTime: new Date(Date.now() + 3600000).toISOString(),
};

export function makeFetchResponse(body: object, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

export function setupFetchMock() {
  globalThis.fetch = mockFetch;
  mockFetch.mockResolvedValue(makeFetchResponse(activeSaleResponse));
}

export function teardownFetchMock() {
  vi.clearAllMocks();
  vi.useRealTimers();
}
