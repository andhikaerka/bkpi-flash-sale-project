// frontend/src/App.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import App from './App';

// ─── Mock global fetch ───────────────────────────────────────────────────────
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// Helper: standard active sale API response
const activeSaleResponse = {
  status: 'active',
  productId: 'flash-sale-product-id',
  remainingStock: 50,
  startTime: new Date(Date.now() - 600000).toISOString(),
  endTime: new Date(Date.now() + 3600000).toISOString(),
};

function makeFetchResponse(body: object, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

beforeEach(() => {
  // NOTE: Do NOT use vi.useFakeTimers() here globally.
  // It freezes waitFor()'s internal polling (which uses setTimeout),
  // causing every async test to time out at 5000ms.
  mockFetch.mockResolvedValue(makeFetchResponse(activeSaleResponse));
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers(); // Safety: restore real timers if any test used fake ones
});

// ─── Loading State ───────────────────────────────────────────────────────────
describe('Loading State', () => {
  it('shows a loading spinner on first render', () => {
    // Keep fetch pending so we stay in loading state
    mockFetch.mockReturnValue(new Promise(() => {}));
    render(<App />);
    expect(screen.getByText(/loading sale parameters/i)).toBeInTheDocument();
  });
});

// ─── Error State ─────────────────────────────────────────────────────────────
describe('Error State', () => {
  it('shows error panel when backend is unreachable', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Database Connection Error/i)).toBeInTheDocument();
    });
  });

  it('shows a Retry Connection button on error', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry connection/i })).toBeInTheDocument();
    });
  });
});

// ─── Active Sale - Main Dashboard ────────────────────────────────────────────
describe('Active Sale Dashboard', () => {
  it('renders the FLASH SALE heading', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('FLASH SALE')).toBeInTheDocument();
    });
  });

  it('displays the Active badge', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('Active')).toBeInTheDocument();
    });
  });

  it('shows remaining stock from API response', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/50\s*\/\s*100/)).toBeInTheDocument();
    });
  });

  it('renders the Buy Now button', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /buy now/i })).toBeInTheDocument();
    });
  });

  it('Buy Now button is enabled when sale is active and stock > 0', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /buy now/i })).not.toBeDisabled();
    });
  });
});

// ─── Purchase Flow ────────────────────────────────────────────────────────────
describe('Purchase Flow', () => {
  // Helper: render App, wait for it to load, then type a userId
  async function renderAndWaitForLoad(userId = 'test@example.com') {
    render(<App />);
    // Wait until the main form (Buy Now button) is visible
    await waitFor(() => screen.getByRole('button', { name: /buy now/i }));
    fireEvent.change(screen.getByPlaceholderText(/janesmith@gmail.com/i), {
      target: { value: userId },
    });
  }

  it('shows success screen after a successful purchase', async () => {
    await renderAndWaitForLoad('winner@example.com');

    mockFetch.mockResolvedValueOnce(
      makeFetchResponse({ message: 'Purchase successful! Your item is secured.' }, true, 201)
    );

    fireEvent.click(screen.getByRole('button', { name: /buy now/i }));

    await waitFor(() => {
      expect(screen.getByText(/Order Secured!/i)).toBeInTheDocument();
    });
  });

  it('shows already-purchased screen when user has already bought', async () => {
    await renderAndWaitForLoad('duplicate@example.com');

    mockFetch.mockResolvedValueOnce(
      makeFetchResponse({ error: 'You have already purchased this item' }, false, 400)
    );

    fireEvent.click(screen.getByRole('button', { name: /buy now/i }));

    await waitFor(() => {
      expect(screen.getByText(/Purchase Failed/i)).toBeInTheDocument();
    });
  });

  it('shows sold out screen when product has no stock', async () => {
    await renderAndWaitForLoad('late@example.com');

    mockFetch.mockResolvedValueOnce(
      makeFetchResponse({ error: 'Product is sold out' }, false, 400)
    );

    fireEvent.click(screen.getByRole('button', { name: /buy now/i }));

    await waitFor(() => {
      expect(screen.getByText(/Sold Out!/i)).toBeInTheDocument();
    });
  });

  it('shows error screen on network failure during purchase', async () => {
    await renderAndWaitForLoad('user@example.com');

    mockFetch.mockRejectedValueOnce(new Error('Network failure'));

    fireEvent.click(screen.getByRole('button', { name: /buy now/i }));

    await waitFor(() => {
      expect(screen.getByText(/Transaction Error/i)).toBeInTheDocument();
    });
  });

  it('shows "Securing Item..." text during submission', async () => {
    await renderAndWaitForLoad('loading@example.com');

    // Never resolve — stay in submitting state
    mockFetch.mockReturnValueOnce(new Promise(() => {}));

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /buy now/i }));
    });

    expect(screen.getByText(/Securing Item.../i)).toBeInTheDocument();
  });
});

// ─── Upcoming / Ended Sale States ─────────────────────────────────────────────
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

// ─── Verify Order Status Panel ────────────────────────────────────────────────
describe('Verify Order Status', () => {
  async function renderAndWaitForVerifyPanel() {
    render(<App />);
    await waitFor(() => screen.getByPlaceholderText(/enter user id to verify/i));
  }

  it('shows "secured" message when user has an order', async () => {
    await renderAndWaitForVerifyPanel();

    mockFetch.mockResolvedValueOnce(
      makeFetchResponse({ userId: 'user-123', hasSecuredItem: true })
    );

    fireEvent.change(screen.getByPlaceholderText(/enter user id to verify/i), {
      target: { value: 'user-123' },
    });
    fireEvent.submit(
      screen.getByPlaceholderText(/enter user id to verify/i).closest('form')!
    );

    await waitFor(() => {
      expect(screen.getByText(/Order confirmed for/i)).toBeInTheDocument();
    });
  });

  it('shows "not found" message when user has no order', async () => {
    await renderAndWaitForVerifyPanel();

    mockFetch.mockResolvedValueOnce(
      makeFetchResponse({ userId: 'nobody', hasSecuredItem: false })
    );

    fireEvent.change(screen.getByPlaceholderText(/enter user id to verify/i), {
      target: { value: 'nobody' },
    });
    fireEvent.submit(
      screen.getByPlaceholderText(/enter user id to verify/i).closest('form')!
    );

    await waitFor(() => {
      expect(screen.getByText(/No order details found for user/i)).toBeInTheDocument();
    });
  });

  it('auto-dismisses the verify result after 3 seconds', async () => {
    // Phase 1: use REAL timers to load the component and trigger the verify
    await renderAndWaitForVerifyPanel();

    mockFetch.mockResolvedValueOnce(
      makeFetchResponse({ userId: 'user-abc', hasSecuredItem: true })
    );

    fireEvent.change(screen.getByPlaceholderText(/enter user id to verify/i), {
      target: { value: 'user-abc' },
    });
    fireEvent.submit(
      screen.getByPlaceholderText(/enter user id to verify/i).closest('form')!
    );

    await waitFor(() => screen.getByText(/Order confirmed for/i));

    // Phase 2: wait for the auto-dismiss (real timers — the 3s setTimeout fires naturally)
    await waitFor(
      () => expect(screen.queryByText(/Order confirmed for/i)).not.toBeInTheDocument(),
      { timeout: 4000 }
    );
  });
});
