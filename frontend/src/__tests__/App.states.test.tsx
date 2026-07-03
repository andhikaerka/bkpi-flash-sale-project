import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from '../App';
import { mockFetch, makeFetchResponse, activeSaleResponse, setupFetchMock, teardownFetchMock } from './testUtils';

beforeEach(() => {
  setupFetchMock();
});

afterEach(() => {
  teardownFetchMock();
});

describe('Non-active Sale States', () => {
  it('disables Buy Now and shows "Sale Upcoming" when status is upcoming', async () => {
    mockFetch.mockResolvedValue(
      makeFetchResponse({ ...activeSaleResponse, status: 'upcoming' })
    );
    render(<App />);

    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /sale upcoming/i });
      expect(btn).toBeDisabled();
    });
  });

  it('disables Buy Now and shows "Sold Out / Sale Ended" when status is ended', async () => {
    mockFetch.mockResolvedValue(
      makeFetchResponse({ ...activeSaleResponse, status: 'ended', remainingStock: 0 })
    );
    render(<App />);

    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /sold out \/ sale ended/i });
      expect(btn).toBeDisabled();
    });
  });
});
