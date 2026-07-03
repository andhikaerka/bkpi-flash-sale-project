import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../App';
import { mockFetch, makeFetchResponse, setupFetchMock, teardownFetchMock } from './testUtils';

beforeEach(() => {
  setupFetchMock();
});

afterEach(() => {
  teardownFetchMock();
});

describe('Verify Order Status', () => {
  async function renderAndWaitForVerifyPanel() {
    render(<App />);
    await waitFor(() => screen.getByPlaceholderText(/enter username or email to verify/i));
  }

  it('shows "secured" message when user has an order', async () => {
    await renderAndWaitForVerifyPanel();

    mockFetch.mockResolvedValueOnce(
      makeFetchResponse({ userId: 'user-123', hasSecuredItem: true })
    );

    fireEvent.change(screen.getByPlaceholderText(/enter username or email to verify/i), {
      target: { value: 'user-123' },
    });
    fireEvent.submit(
      screen.getByPlaceholderText(/enter username or email to verify/i).closest('form')!
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

    fireEvent.change(screen.getByPlaceholderText(/enter username or email to verify/i), {
      target: { value: 'nobody' },
    });
    fireEvent.submit(
      screen.getByPlaceholderText(/enter username or email to verify/i).closest('form')!
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

    fireEvent.change(screen.getByPlaceholderText(/enter username or email to verify/i), {
      target: { value: 'user-abc' },
    });
    fireEvent.submit(
      screen.getByPlaceholderText(/enter username or email to verify/i).closest('form')!
    );

    await waitFor(() => screen.getByText(/Order confirmed for/i));

    // Phase 2: wait for the auto-dismiss (real timers — the 3s setTimeout fires naturally)
    await waitFor(
      () => expect(screen.queryByText(/Order confirmed for/i)).not.toBeInTheDocument(),
      { timeout: 4000 }
    );
  });
});
