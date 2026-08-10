import { describe, expect, it, vi } from 'vitest';
import { alignDevProxySecurityHeaders } from './vite.config.js';

describe('development API proxy security headers', () => {
  it('aligns browser security headers with the validated upstream origin', () => {
    const proxyRequest = {
      setHeader: vi.fn(),
      removeHeader: vi.fn(),
    };

    alignDevProxySecurityHeaders(
      proxyRequest,
      {
        headers: {
          origin: 'http://127.0.0.1:5173',
          referer: 'http://127.0.0.1:5173/students/42?tab=overview',
        },
      },
      'https://tenant.example',
    );

    expect(proxyRequest.setHeader).toHaveBeenCalledWith('Origin', 'https://tenant.example');
    expect(proxyRequest.setHeader).toHaveBeenCalledWith(
      'Referer',
      'https://tenant.example/students/42?tab=overview',
    );
    expect(proxyRequest.removeHeader).not.toHaveBeenCalled();
  });

  it('does not manufacture an Origin and drops a malformed Referer', () => {
    const proxyRequest = {
      setHeader: vi.fn(),
      removeHeader: vi.fn(),
    };

    alignDevProxySecurityHeaders(
      proxyRequest,
      { headers: { referer: 'not a URL' } },
      'https://tenant.example',
    );

    expect(proxyRequest.setHeader).not.toHaveBeenCalled();
    expect(proxyRequest.removeHeader).toHaveBeenCalledWith('Referer');
  });

  it('keeps a network-path-shaped Referer on the selected upstream host', () => {
    const proxyRequest = {
      setHeader: vi.fn(),
      removeHeader: vi.fn(),
    };

    alignDevProxySecurityHeaders(
      proxyRequest,
      { headers: { referer: 'http://127.0.0.1:5173//untrusted.example/path?tab=one' } },
      'https://tenant.example',
    );

    expect(proxyRequest.setHeader).toHaveBeenCalledWith(
      'Referer',
      'https://tenant.example//untrusted.example/path?tab=one',
    );
  });
});
