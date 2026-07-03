import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';
import { mockFetch, setupFetchMock, teardownFetchMock } from './testUtils';

beforeEach(() => {
  setupFetchMock();
});

afterEach(() => {
  teardownFetchMock();
});

describe('Loading State', () => {
  it('shows a loading spinner on first render', () => {
    // Keep fetch pending so we stay in loading state
    mockFetch.mockReturnValue(new Promise(() => {}));
    render(<App />);
    expect(screen.getByText(/loading sale parameters/i)).toBeInTheDocument();
  });
});
