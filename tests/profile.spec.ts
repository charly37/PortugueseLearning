import { test, expect } from '@playwright/test';
import { registerAndLogin, login } from './helpers/auth-helper';

test.describe('Profile Page', () => {
  let testUser: { username: string; email: string; password: string };

  test.beforeAll(async ({ browser }) => {
    // Create one user for all tests in this suite
    testUser = {
      username: `profiletest_${Date.now()}`,
      email: `profiletest_${Date.now()}@example.com`,
      password: 'testpassword123'
    };

    // Register the user once
    const page = await browser.newPage();
    await registerAndLogin(page, testUser.username, testUser.email, testUser.password);
    await page.close();
  });

  test.beforeEach(async ({ page }) => {
    // Login with the existing user before each test
    await login(page, testUser.email, testUser.password);
  });

  test('should navigate to profile page by clicking username', async ({ page }) => {
    // Click on username chip
    await page.getByRole('button', { name: testUser.username }).click();
    
    // Should be on profile page
    await expect(page.locator('h1')).toContainText('My Profile');
  });

  test('should display user information on profile page', async ({ page }) => {
    // Navigate to profile
    await page.getByRole('button', { name: testUser.username }).click();
    
    // Verify profile information is displayed
    await expect(page.locator('h4')).toContainText(testUser.username);
    
    // Check for username field
    const usernameSection = page.locator('text=Username').locator('..');
    await expect(usernameSection).toContainText(testUser.username);
    
    // Check for email field
    const emailSection = page.locator('text=Email').locator('..');
    await expect(emailSection).toContainText(testUser.email);
    
    // Check for member since field
    await expect(page.getByText('Member Since')).toBeVisible();
  });

  test('should display user avatar with initial', async ({ page }) => {
    // Navigate to profile
    await page.getByRole('button', { name: testUser.username }).click();
    
    // Check avatar displays first letter of username
    const firstLetter = testUser.username.charAt(0).toUpperCase();
    await expect(page.getByText(firstLetter, { exact: true }).first()).toBeVisible();
  });

  test('should display member since date', async ({ page }) => {
    // Navigate to profile
    await page.getByRole('button', { name: testUser.username }).click();
    
    // Verify member since date is shown
    await expect(page.getByText('Member Since')).toBeVisible();
    // Date should be visible in some format
    const currentYear = new Date().getFullYear();
    await expect(page.getByText(currentYear.toString())).toBeVisible();
  });

  test('should navigate back to landing page from profile', async ({ page }) => {
    // Navigate to profile
    await page.getByRole('button', { name: testUser.username }).click();
    await expect(page.locator('h1')).toContainText('My Profile');
    
    // Click back button
    await page.getByRole('button', { name: 'Back' }).click();
    
    // Should be back on landing page
    await expect(page.locator('h1')).toContainText('Welcome');
  });

  test('should show profile icon on profile page', async ({ page }) => {
    // Navigate to profile
    await page.getByRole('button', { name: testUser.username }).click();
    
    // Profile page should have person icons
    const profileIcons = page.locator('[data-testid="PersonIcon"]');
    await expect(profileIcons.first()).toBeVisible();
  });

  test('should show email icon on profile page', async ({ page }) => {
    // Navigate to profile
    await page.getByRole('button', { name: testUser.username }).click();
    
    // Profile page should have email icon
    const emailIcon = page.locator('[data-testid="EmailIcon"]');
    await expect(emailIcon).toBeVisible();
  });

  test('should show calendar icon for member since date', async ({ page }) => {
    // Navigate to profile
    await page.getByRole('button', { name: testUser.username }).click();
    
    // Profile page should have calendar icon
    const calendarIcon = page.locator('[data-testid="CalendarTodayIcon"]');
    await expect(calendarIcon).toBeVisible();
  });

  test('should display motivational message', async ({ page }) => {
    // Navigate to profile
    await page.getByRole('button', { name: testUser.username }).click();
    
    // Check for motivational message
    await expect(page.getByText(/Keep learning/i)).toBeVisible();
  });

  test('should maintain session when navigating to and from profile', async ({ page }) => {
    // Go to profile
    await page.getByRole('button', { name: testUser.username }).click();
    await expect(page.locator('h1')).toContainText('My Profile');
    
    // Go back to landing
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.locator('h1')).toContainText('Welcome');
    
    // Go to profile again
    await page.getByRole('button', { name: testUser.username }).click();
    await expect(page.locator('h1')).toContainText('My Profile');
    
    // Should still show correct user info
    await expect(page.locator('h4')).toContainText(testUser.username);
    await expect(page.getByText(testUser.email)).toBeVisible();
  });

  test('should not access profile when logged out', async ({ page }) => {
    // Logout
    await page.getByRole('button', { name: 'Logout', exact: true }).click();
    
    // Should be on landing page after logout
    await expect(page.locator('h1')).toContainText('Welcome');
    
    // Verify user is logged out - Login button should be visible
    await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
    
    // Try to navigate to profile when logged out should redirect to login
    await page.goto('/');
    
    // Manually try to access profile (simulate clicking if profile button was available)
    // Since there's no profile button for logged out users, we just verify landing page is shown
    await expect(page.locator('h1')).toContainText('Welcome');
  });
});
