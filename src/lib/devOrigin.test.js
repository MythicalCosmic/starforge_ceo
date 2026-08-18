import { describe, expect, it } from 'vitest';
import { isolatedDevelopmentUrl } from './devOrigin.js';

describe('isolatedDevelopmentUrl', () => {
  it('moves a loopback URL to the app-specific hostname without losing its route', () => {
    const location = new URL('http://localhost:5174/tasks?scope=active#mine');

    expect(isolatedDevelopmentUrl(location, 'ceo.localhost')).toBe(
      'http://ceo.localhost:5174/tasks?scope=active#mine',
    );
  });

  it('does not redirect tunnels or an already isolated hostname', () => {
    expect(isolatedDevelopmentUrl(new URL('https://console.example.com/tasks'), 'ceo.localhost')).toBe('');
    expect(isolatedDevelopmentUrl(new URL('http://ceo.localhost:5174/tasks'), 'ceo.localhost')).toBe('');
  });
});
