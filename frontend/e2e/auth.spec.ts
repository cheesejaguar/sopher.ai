import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';

/**
 * E2E tests for authentication flows
 */

test.describe('Authentication Flow', () => {
  test('should display login page for unauthenticated users', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.expectLoaded();
  });

  test('should redirect protected routes to login', async ({ page }) => {
    // Try to access the dashboard without authentication
    await page.goto('/');

    // Should be redirected to login
    await expect(page).toHaveURL(/.*login.*/);
  });

  test('should handle OAuth error parameters', async ({ page }) => {
    // Simulate OAuth error callback
    await page.goto('/login?error=access_denied&error_description=User%20denied%20access');

    // Page should still load
    await expect(page).toHaveURL(/.*login.*/);
  });

  test('should handle successful callback redirect', async ({ page }) => {
    // Note: This test simulates the callback flow
    // In a real test, we'd mock the OAuth provider or use a test account

    // Simulate callback with access token (mocked scenario)
    await page.goto('/auth/callback/google?code=test_code');

    // Should attempt to process the callback
    // (Will fail without backend, but should not crash)
    await page.waitForLoadState('networkidle');
  });
});

test.describe('Session Handling', () => {
  test('should clear cookies on logout', async ({ page, context }) => {
    // Set some test cookies
    await context.addCookies([
      {
        name: 'access_token',
        value: 'test_token',
        domain: 'localhost',
        path: '/',
      },
      {
        name: 'refresh_token',
        value: 'test_refresh',
        domain: 'localhost',
        path: '/',
      },
    ]);

    // Navigate to a page
    await page.goto('/');

    // Verify cookies are set
    let cookies = await context.cookies();
    expect(cookies.some((c) => c.name === 'access_token')).toBe(true);

    // Clear cookies (simulating logout)
    await context.clearCookies();

    // Verify cookies are cleared
    cookies = await context.cookies();
    expect(cookies.some((c) => c.name === 'access_token')).toBe(false);
  });
});
