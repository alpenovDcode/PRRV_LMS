import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
  await page.goto('/');

  // Expect a title "to contain" a substring.
  // Note: Adjust the expected title based on your actual metadata.
  // Since we redirect to login, we might check for login page characteristics or just the redirect.
  await expect(page).toHaveURL(/.*login/);
});
