import { test, expect } from '@playwright/test';
import { setLanguageToEnglish } from './helpers/language-helper';
import { findAuthButton, verifyUserLoggedIn } from './helpers/auth-helper';

test.describe('Authentication', () => {
  test('should display landing page on first visit with login option', async ({ page }) => {
    await setLanguageToEnglish(page);
    await page.goto('/');
    
    // Verify we're on the landing page (check for challenge cards)
    await expect(page.locator('text=Word Challenge')).toBeVisible();
    
    // Verify login button is accessible (either in header or drawer)
    const loginButton = await findAuthButton(page, 'Login');
    await expect(loginButton).toBeVisible();
    
    const registerButton = await findAuthButton(page, 'Register');
    await expect(registerButton).toBeVisible();
  });

  test('should navigate to register page', async ({ page }) => {
    await setLanguageToEnglish(page);
    await page.goto('/');
    
    // Click Register button
    const registerButton = await findAuthButton(page, 'Register');
    await registerButton.click();
    
    // Wait for register page
    await page.waitForSelector('h1:has-text("Register")');
    
    // Verify we're on the register page
    await expect(page.locator('h1')).toContainText('Register');
    await expect(page.getByLabel('Username')).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password').first()).toBeVisible();
    await expect(page.getByLabel('Confirm Password')).toBeVisible();
  });

  test('should register a new user successfully @smoke', async ({ page }) => {
    await setLanguageToEnglish(page);
    const testUser = {
      username: `testuser_${Date.now()}`,
      email: `test_${Date.now()}@example.com`,
      password: 'testpassword123'
    };

    await page.goto('/');
    
    // Navigate to register page from landing page
    const registerButton = await findAuthButton(page, 'Register');
    await registerButton.click();
    
    // Wait for register page
    await page.waitForSelector('h1:has-text("Register")');
    
    // Fill in registration form
    await page.getByLabel('Username').fill(testUser.username);
    await page.getByLabel('Email').fill(testUser.email);
    await page.getByLabel('Password').first().fill(testUser.password);
    await page.getByLabel('Confirm Password').fill(testUser.password);
    
    // Submit form
    await page.locator('form').getByRole('button', { name: /Register/i }).click();
    
    // Should redirect to landing page with challenge cards visible
    await expect(page.locator('text=Word Challenge')).toBeVisible({ timeout: 10000 });
    
    // Should see username in header (button on desktop, profile icon on mobile)
    await expect(await verifyUserLoggedIn(page, testUser.username)).toBeTruthy();
  });

  test('should not register with invalid email', async ({ page }) => {
    await setLanguageToEnglish(page);
    await page.goto('/');
    const registerButton = await findAuthButton(page, 'Register');
    await registerButton.click();
    await page.waitForTimeout(400); // Wait for drawer close animation
    await page.waitForSelector('h1:has-text("Register")');
    
    await page.getByLabel('Username').fill('testuser');
    await page.getByLabel('Email').fill('invalid-email');
    await page.getByLabel('Password').first().fill('password123');
    await page.getByLabel('Confirm Password').fill('password123');
    
    // HTML5 validation should prevent submission
    const emailInput = page.getByLabel('Email');
    await expect(emailInput).toHaveAttribute('type', 'email');
  });

  test('should not register with password mismatch', async ({ page }) => {
    await setLanguageToEnglish(page);
    await page.goto('/');
    const registerButton = await findAuthButton(page, 'Register');
    await registerButton.click();
    await page.waitForTimeout(400); // Wait for drawer close animation
    await page.waitForSelector('h1:has-text("Register")');
    
    await page.getByLabel('Username').fill('testuser');
    await page.getByLabel('Email').fill('test@example.com');
    await page.getByLabel('Password').first().fill('password123');
    await page.getByLabel('Confirm Password').fill('differentpassword');
    
    await page.locator('form').getByRole('button', { name: /Register/i }).click();
    
    // Should show error message
    await expect(page.getByText(/passwords do not match/i)).toBeVisible();
  });

  test('should not register with short password', async ({ page }) => {
    await setLanguageToEnglish(page);
    await page.goto('/');
    const registerButton = await findAuthButton(page, 'Register');
    await registerButton.click();
    await page.waitForTimeout(400); // Wait for drawer close animation
    await page.waitForSelector('h1:has-text("Register")');
    
    await page.getByLabel('Username').fill('testuser');
    await page.getByLabel('Email').fill('test@example.com');
    await page.getByLabel('Password').first().fill('123');
    await page.getByLabel('Confirm Password').fill('123');
    
    await page.locator('form').getByRole('button', { name: /Register/i }).click();
    
    // Should show error message
    await expect(page.getByText(/at least 6 characters/i).first()).toBeVisible();
  });

  test('should login with valid credentials @smoke', async ({ page }) => {
    await setLanguageToEnglish(page);
    // First register a unique user
    const uniqueUser = {
      username: `logintest_${Date.now()}`,
      email: `logintest_${Date.now()}@example.com`,
      password: 'testpassword123'
    };
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const registerBtn = await findAuthButton(page, 'Register');
    await registerBtn.click();
    await page.waitForTimeout(400); // Wait for drawer close animation
    await page.waitForSelector('h1:has-text("Register")');
    
    await page.getByLabel('Username').fill(uniqueUser.username);
    await page.getByLabel('Email').fill(uniqueUser.email);
    await page.getByLabel('Password').first().fill(uniqueUser.password);
    await page.getByLabel('Confirm Password').fill(uniqueUser.password);
    await page.locator('form').getByRole('button', { name: /Register/i }).click();
    
    // Wait for landing page with challenge cards and username to appear
    await expect(page.locator('text=Word Challenge')).toBeVisible({ timeout: 10000 });
    await expect(await verifyUserLoggedIn(page, uniqueUser.username)).toBeTruthy();
    
    // Logout using findAuthButton helper (handles drawer on mobile)
    const logoutBtn = await findAuthButton(page, 'Logout');
    await logoutBtn.click({ force: true });
    
    // Wait for drawer to close and logout to complete
    await page.waitForTimeout(500);
    
    // Wait for logout to complete - verify Login button appears (might be in drawer on mobile)
    const loginButton = await findAuthButton(page, 'Login');
    await expect(loginButton).toBeVisible({ timeout: 10000 });
    
    // Now login with the same credentials - verify on landing page
    await expect(page.locator('text=Word Challenge')).toBeVisible();
    // Click the Login button (handles drawer on mobile)
    await loginButton.click({ force: true });
    await page.waitForTimeout(400); // Wait for drawer close animation if on mobile
    // Wait for Login page to load
    await expect(page.locator('h1')).toContainText('Login', { timeout: 10000 });
    
    await page.getByLabel('Email').fill(uniqueUser.email);
    await page.getByLabel('Password').fill(uniqueUser.password);
    await page.locator('form').getByRole('button', { name: /Login/i }).click();
    
    // Should redirect to landing page with challenge cards visible
    await expect(page.locator('text=Word Challenge')).toBeVisible({ timeout: 10000 });
    await expect(await verifyUserLoggedIn(page, uniqueUser.username)).toBeTruthy();
  });

  test('should not login with invalid credentials', async ({ page }) => {
    await setLanguageToEnglish(page);
    await page.goto('/');
    
    // Navigate to login page
    const loginButton = await findAuthButton(page, 'Login');
    await loginButton.click();
    await page.waitForSelector('h1:has-text("Login")');
    
    await page.getByLabel('Email').fill('nonexistent@example.com');
    await page.getByLabel('Password').fill('wrongpassword');
    
    await page.locator('form').getByRole('button', { name: /Login/i }).click();
    
    // Should show error message
    await expect(page.getByText(/invalid/i)).toBeVisible();
  });

  test('should logout successfully @smoke', async ({ page }) => {
    await setLanguageToEnglish(page);
    // Register and login first
    const uniqueUser = {
      username: `logouttest_${Date.now()}`,
      email: `logouttest_${Date.now()}@example.com`,
      password: 'testpassword123'
    };
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const registerBtn = await findAuthButton(page, 'Register');
    await registerBtn.click();
    await page.waitForTimeout(400); // Wait for drawer close animation
    await page.waitForSelector('h1:has-text("Register")');
    
    await page.getByLabel('Username').fill(uniqueUser.username);
    await page.getByLabel('Email').fill(uniqueUser.email);
    await page.getByLabel('Password').first().fill(uniqueUser.password);
    await page.getByLabel('Confirm Password').fill(uniqueUser.password);
    await page.locator('form').getByRole('button', { name: /Register/i }).click();
    
    // Wait for landing page with challenge cards and username to appear
    await expect(page.locator('text=Word Challenge')).toBeVisible({ timeout: 10000 });
    await expect(await verifyUserLoggedIn(page, uniqueUser.username)).toBeTruthy();
    
    // Logout - use the onLogout handler which should make the API call
    // On mobile, need to open drawer first
    const isMobile = await page.getByRole('button', { name: 'open menu' }).isVisible().catch(() => false);
    
    if (isMobile) {
      await page.getByRole('button', { name: 'open menu' }).click();
      await page.waitForTimeout(400);
      // Click the logout list item button in the drawer
      await page.locator('[role="presentation"]').getByRole('button', { name: 'Logout', exact: true }).click();
    } else {
      // On desktop, click the logout button in header
      await page.locator('header').getByRole('button', { name: 'Logout', exact: true }).click();
    }
    
    // Wait for logout API call to complete
    await page.waitForResponse(response => response.url().includes('/api/auth/logout'), { timeout: 3000 });
    
    // Wait for network request to complete and page to stabilize
    await page.waitForLoadState('networkidle');
    
    // Should stay on landing page, but now as guest (challenge cards still visible)
    await expect(page.locator('text=Word Challenge')).toBeVisible();
    
    // Give time for React to re-render after state change
    await page.waitForTimeout(1000);
    
    // Debug: Take screenshot to see what's on the page
    await page.screenshot({ path: 'test-results/logout-debug.png', fullPage: true });
    
    // Verify logout was successful - Login button should be accessible (might be in drawer on mobile)
    const loginButton = await findAuthButton(page, 'Login');
    await expect(loginButton).toBeVisible({ timeout: 5000 });
  });

  test('should navigate back to login from register page', async ({ page }) => {
    await setLanguageToEnglish(page);
    await page.goto('/');
    
    // Navigate to register page from landing page
    const registerButton = await findAuthButton(page, 'Register');
    await registerButton.click();
    
    // Wait for and verify register page
    await page.waitForSelector('h1:has-text("Register")');
    await expect(page.locator('h1')).toContainText('Register');
    
    // Navigate back to login
    await page.getByRole('button', { name: /sign in|login here/i }).click();
    
    // Wait for login page
    await page.waitForSelector('h1:has-text("Login")');
    
    // Should be on login page
    await expect(page.locator('h1')).toContainText('Login');
  });

  test('should persist session after page reload', async ({ page }) => {
    await setLanguageToEnglish(page);
    // Register a user
    const uniqueUser = {
      username: `sessiontest_${Date.now()}`,
      email: `sessiontest_${Date.now()}@example.com`,
      password: 'testpassword123'
    };
    
    await page.goto('/');
    const registerBtn = await findAuthButton(page, 'Register');
    await registerBtn.click();
    await page.waitForTimeout(400); // Wait for drawer close animation
    await page.waitForSelector('h1:has-text("Register")');
    
    await page.getByLabel('Username').fill(uniqueUser.username);
    await page.getByLabel('Email').fill(uniqueUser.email);
    await page.getByLabel('Password').first().fill(uniqueUser.password);
    await page.getByLabel('Confirm Password').fill(uniqueUser.password);
    await page.locator('form').getByRole('button', { name: /Register/i }).click();
    
    // Wait for landing page with challenge cards
    await expect(page.locator('text=Word Challenge')).toBeVisible({ timeout: 10000 });
    
    // Reload page
    await page.reload();
    
    // Should still be on landing page with challenge cards visible
    await expect(page.locator('text=Word Challenge')).toBeVisible();
    await expect(await verifyUserLoggedIn(page, uniqueUser.username)).toBeTruthy();
  });
});
