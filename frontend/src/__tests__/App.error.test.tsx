import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import App from '../App';
import { mockFetch, setupFetchMock, teardownFetchMock } from './testUtils';

beforeEach(() => {
  setupFetchMock();
});

afterEach(() => {
  teardownFetchMock();
});

describe('Error State', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('shows error panel when backend is unreachable', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));
    render(<App />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(12000);
    });

    expect(screen.getByText(/Database Connection Error/i)).toBeInTheDocument();
  });

  it('shows a Retry Connection button on error', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));
    render(<App />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(12000);
    });

    expect(screen.getByRole('button', { name: /retry connection/i })).toBeInTheDocument();
  });
});
