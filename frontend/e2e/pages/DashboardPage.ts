import { Page, Locator, expect } from '@playwright/test';

/**
 * Page Object Model for the Dashboard/Main page
 */
export class DashboardPage {
  readonly page: Page;
  readonly briefInput: Locator;
  readonly generateButton: Locator;
  readonly outlineSection: Locator;
  readonly progressBar: Locator;
  readonly costDisplay: Locator;
  readonly errorDisplay: Locator;

  constructor(page: Page) {
    this.page = page;
    this.briefInput = page.locator('textarea[name="brief"], textarea[placeholder*="brief"]');
    this.generateButton = page.getByRole('button', { name: /generate/i });
    this.outlineSection = page.locator('[data-testid="outline-section"]');
    this.progressBar = page.locator('[role="progressbar"]');
    this.costDisplay = page.locator('[data-testid="cost-display"]');
    this.errorDisplay = page.locator('[data-testid="error-display"]');
  }

  async goto() {
    await this.page.goto('/');
    await this.page.waitForLoadState('networkidle');
  }

  async expectLoaded() {
    await expect(this.page).toHaveURL('/');
  }

  async enterBrief(text: string) {
    await this.briefInput.fill(text);
  }

  async clickGenerate() {
    await this.generateButton.click();
  }

  async waitForOutline(timeout = 60000) {
    await this.outlineSection.waitFor({ state: 'visible', timeout });
  }

  async hasError() {
    return this.errorDisplay.isVisible();
  }

  async getErrorText() {
    if (await this.hasError()) {
      return this.errorDisplay.textContent();
    }
    return null;
  }

  async getCostDisplay() {
    if (await this.costDisplay.isVisible()) {
      return this.costDisplay.textContent();
    }
    return null;
  }
}
