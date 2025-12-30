import { test, expect } from '@playwright/test';

/**
 * E2E tests for basic navigation and page loading
 */

test.describe('Navigation', () => {
  test('should load the home page', async ({ page }) => {
    await page.goto('/');

    // Page should load without errors
    await expect(page).toHaveURL('/');
  });

  test('should redirect unauthenticated users to login', async ({ page }) => {
    // Try to access a protected route
    await page.goto('/dashboard');

    // Should be redirected to login
    await expect(page).toHaveURL(/.*login.*/);
  });

  test('should load the login page', async ({ page }) => {
    await page.goto('/login');

    // Login page should have authentication elements
    await expect(page).toHaveURL(/.*login.*/);
  });
});

test.describe('Page Accessibility', () => {
  test('should have proper title on home page', async ({ page }) => {
    await page.goto('/');

    // Page should have a title
    const title = await page.title();
    expect(title).toBeTruthy();
  });

  test('should have no console errors on load', async ({ page }) => {
    const consoleErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Filter out expected errors (like auth redirect)
    const unexpectedErrors = consoleErrors.filter(
      (error) => !error.includes('401') && !error.includes('Unauthorized')
    );

    expect(unexpectedErrors).toHaveLength(0);
  });
});
