import { Page, Locator, expect } from '@playwright/test';

/**
 * Page Object Model for the Login page
 */
export class LoginPage {
  readonly page: Page;
  readonly googleLoginButton: Locator;
  readonly pageTitle: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.googleLoginButton = page.getByRole('button', { name: /google/i });
    this.pageTitle = page.getByRole('heading', { level: 1 });
    this.errorMessage = page.locator('[data-testid="error-message"]');
  }

  async goto() {
    await this.page.goto('/login');
    await this.page.waitForLoadState('networkidle');
  }

  async expectLoaded() {
    await expect(this.page).toHaveURL(/.*login.*/);
  }

  async hasGoogleLoginOption() {
    return this.googleLoginButton.isVisible();
  }

  async getErrorMessage() {
    if (await this.errorMessage.isVisible()) {
      return this.errorMessage.textContent();
    }
    return null;
  }
}
