import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from '../App';
import { setupFetchMock, teardownFetchMock } from './testUtils';

beforeEach(() => {
  setupFetchMock();
});

afterEach(() => {
  teardownFetchMock();
});

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
