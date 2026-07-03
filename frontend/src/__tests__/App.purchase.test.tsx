import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import App from '../App';
import { mockFetch, makeFetchResponse, setupFetchMock, teardownFetchMock } from './testUtils';

beforeEach(() => {
  setupFetchMock();
});

afterEach(() => {
  teardownFetchMock();
});

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

  it('removes the purchase form during submission', async () => {
    await renderAndWaitForLoad('loading@example.com');

    // Never resolve — stay in submitting state
    mockFetch.mockReturnValueOnce(new Promise(() => {}));

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /buy now/i }));
    });

    // The FeedbackScreen takes over but renders null for 'submitting'
    expect(screen.queryByRole('button', { name: /buy now/i })).not.toBeInTheDocument();
  });
});
