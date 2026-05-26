import { Page, Locator } from '@playwright/test';

/**
 * Check if button is visible in header or drawer (for mobile)
 * Returns a function that when called will click the button appropriately
 */
export async function findAuthButton(page: Page, buttonName: string): Promise<Locator> {
  // Wait for page to be fully loaded and stable before interacting with buttons
  await page.waitForLoadState('networkidle');

  // First check if it's visible directly (desktop mode)
  const directButton = page.getByRole('button', { name: buttonName }).first();
  const isDirectlyVisible = await directButton.isVisible().catch(() => false);
  
  if (isDirectlyVisible) {
    // Scroll into view so the bounding box is stable before the caller clicks
    await directButton.scrollIntoViewIfNeeded().catch(() => {});
    await directButton.waitFor({ state: 'visible' });
    return directButton;
  }
  
  // Check if mobile menu exists
  const mobileMenuButton = page.getByRole('button', { name: 'open menu' });
  const hasMobileMenu = await mobileMenuButton.isVisible().catch(() => false);
  
  if (hasMobileMenu) {
    // On mobile, open drawer first if not already open
    const isDrawerOpen = await page.locator('[role="presentation"]').isVisible().catch(() => false);
    if (!isDrawerOpen) {
      await mobileMenuButton.click();
      await page.waitForTimeout(300); // Wait for drawer animation
    }
    return page.locator('[role="presentation"]').getByRole('button', { name: buttonName }).first();
  }
  
  // Fallback to just finding the button anywhere
  return directButton;
}

/**
 * Verify that user is logged in by checking for username button (desktop) or profile icon (mobile)
 */
export async function verifyUserLoggedIn(page: Page, username: string): Promise<boolean> {
  // Check if mobile menu button exists (viewport < md breakpoint)
  const mobileMenuButton = page.getByRole('button', { name: 'open menu' });
  const isMobile = await mobileMenuButton.isVisible().catch(() => false);
  
  if (isMobile) {
    // On mobile: look for profile icon button in header
    const profileIcon = page.locator('header').getByRole('button', { name: 'profile' });
    return await profileIcon.isVisible().catch(() => false);
  } else {
    // On desktop: look for username button
    const usernameButton = page.getByRole('button', { name: username });
    return await usernameButton.isVisible().catch(() => false);
  }
}

/**
 * Helper function to register and login a new user
 */
export async function registerAndLogin(
  page: Page,
  username: string,
  email: string,
  password: string
): Promise<void> {
  await page.goto('/');
  
  // Wait for landing page to load (check for challenge cards)
  await page.waitForSelector('text=Word Challenge', { timeout: 5000 });
  
  // Check if mobile menu button exists (viewport < md breakpoint)
  const mobileMenuButton = page.getByRole('button', { name: 'open menu' });
  const isMobile = await mobileMenuButton.isVisible().catch(() => false);
  
  if (isMobile) {
    // On mobile: open drawer and click register from there
    await mobileMenuButton.click();
    await page.locator('[role="presentation"]').getByRole('button', { name: 'Register' }).click();
  } else {
    // On desktop: click register button directly in header
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Register' }).click();
  }
  
  // Wait for register page to load
  await page.waitForSelector('h1:has-text("Register")', { timeout: 5000 });
  
  // Fill in registration form
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').first().fill(password);
  await page.getByLabel('Confirm Password').fill(password);
  
  // Submit form - use the submit button in the form, not the header
  await page.locator('form').getByRole('button', { name: /Register/i }).click();
  
  // Wait for landing page to load - check for challenge cards
  await page.waitForSelector('text=Word Challenge', { timeout: 10000 });
}

/**
 * Helper function to login an existing user
 */
export async function login(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  await page.goto('/');
  
  // Wait for landing page and navigate to login page
  await page.waitForSelector('text=Word Challenge', { timeout: 5000 });
  
  const loginButton = await findAuthButton(page, 'Login');
  await loginButton.click();
  await page.waitForSelector('h1:has-text("Login")', { timeout: 5000 });
  
  // Fill in login form
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  
  // Submit form - use the submit button in the form, not the header
  await page.locator('form').getByRole('button', { name: /Login/i }).click();
  
  // Wait for landing page to load - check for challenge cards
  await page.waitForSelector('text=Word Challenge', { timeout: 10000 });
}

/**
 * Helper function to logout
 */
export async function logout(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Logout/i }).click();
  
  // Wait for landing page to load (logout now redirects to landing page)
  await page.waitForSelector('text=Word Challenge', { timeout: 5000 });
}
