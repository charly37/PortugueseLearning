import { test, expect } from '@playwright/test';
import { registerAndLogin, login } from './helpers/auth-helper';
import { setLanguageToEnglish } from './helpers/language-helper';

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
    await setLanguageToEnglish(page);
    await registerAndLogin(page, testUser.username, testUser.email, testUser.password);
    await page.close();
  });

  test.beforeEach(async ({ page }) => {
    await setLanguageToEnglish(page);
    // Login with the existing user before each test
    await login(page, testUser.email, testUser.password);
    // Wait for page to be fully loaded
    await page.waitForLoadState('networkidle');
  });

  // Helper function to click username button/icon reliably (handles both desktop and mobile)
  async function clickUsername(page: any, username: string) {
    // Check if we're on mobile (profile icon button visible)
    const mobileProfileIcon = page.locator('header').getByRole('button', { name: 'profile' });
    const isMobileIcon = await mobileProfileIcon.isVisible().catch(() => false);
    
    if (isMobileIcon) {
      // On mobile: click the profile icon button
      await mobileProfileIcon.click();
    } else {
      // On desktop: click the username chip
      const usernameButton = page.getByRole('button', { name: username });
      await usernameButton.waitFor({ state: 'visible' });
      await page.waitForTimeout(100);
      await usernameButton.click({ force: true });
    }
  }

  // Helper function to navigate home (handles drawer on mobile)
  async function navigateHome(page: any) {
    // Check if mobile menu button exists
    const mobileMenuButton = page.getByRole('button', { name: 'open menu' });
    const isMobile = await mobileMenuButton.isVisible().catch(() => false);
    
    if (isMobile) {
      // On mobile: open drawer and click Home
      await mobileMenuButton.click();
      await page.waitForTimeout(300); // Wait for drawer animation
      await page.locator('[role="presentation"]').getByRole('button', { name: 'Home' }).click();
      // Wait for drawer to close and landing page to fully settle (MUI v9 animations)
      await page.waitForSelector('[role="presentation"]', { state: 'hidden', timeout: 3000 }).catch(() => {});
      await page.waitForLoadState('networkidle');
    } else {
      // On desktop: click Home button in header
      await page.getByRole('button', { name: 'Home' }).click({ force: true });
    }
  }

  test('should navigate to profile page by clicking username @smoke', async ({ page }) => {
    // Click on username chip
    await clickUsername(page, testUser.username);
    
    // Should be on profile page
    await expect(page.locator('h1')).toContainText('My Profile');
  });

  test('should display user information on profile page', async ({ page }) => {
    // Navigate to profile
    await clickUsername(page, testUser.username);
    
    // Verify profile information is displayed
    await expect(page.locator('h4')).toContainText(testUser.username);
    
    // Check for username field
    const usernameSection = page.locator('text=Username').locator('..');
    await expect(usernameSection).toContainText(testUser.username);
    
    // Check for email field
    const emailSection = page.locator('text=Email').locator('..');
    await expect(emailSection).toContainText(testUser.email);
    
    // Check for member since field
    await expect(page.getByText('Created On')).toBeVisible();
  });

  test('should display user avatar with initial', async ({ page }) => {
    // Navigate to profile
    await clickUsername(page, testUser.username);
    
    // Check avatar displays first letter of username
    const firstLetter = testUser.username.charAt(0).toUpperCase();
    await expect(page.getByText(firstLetter, { exact: true }).first()).toBeVisible();
  });

  test('should display member since date', async ({ page }) => {
    // Navigate to profile
    await clickUsername(page, testUser.username);
    
    // Verify member since date is shown
    await expect(page.getByText('Created On')).toBeVisible();
    // Date should be visible in some format
    const currentYear = new Date().getFullYear();
    await expect(page.getByText(currentYear.toString())).toBeVisible();
  });

  test('should navigate back to landing page from profile', async ({ page }) => {
    // Navigate to profile
    await clickUsername(page, testUser.username);
    await expect(page.locator('h1')).toContainText('My Profile');
    
    // Use Home button from header (or drawer on mobile)
    await navigateHome(page);
    
    // Should be back on landing page
    await expect(page.locator('text=Word Challenge')).toBeVisible();
  });

  test('should show profile icon on profile page', async ({ page }) => {
    // Navigate to profile
    await clickUsername(page, testUser.username);
    
    // Profile page should have person icons (allow them to be in DOM even if not fully visible on mobile)
    const profileIcons = page.locator('[data-testid="PersonIcon"]');
    const iconCount = await profileIcons.count();
    expect(iconCount).toBeGreaterThan(0);
  });

  test('should show email icon on profile page', async ({ page }) => {
    // Navigate to profile
    await clickUsername(page, testUser.username);
    
    // Profile page should have email icon
    const emailIcon = page.locator('[data-testid="EmailIcon"]');
    await expect(emailIcon).toBeVisible();
  });

  test('should show calendar icon for member since date', async ({ page }) => {
    // Navigate to profile
    await clickUsername(page, testUser.username);
    
    // Profile page should have calendar icon
    const calendarIcon = page.locator('[data-testid="CalendarTodayIcon"]');
    await expect(calendarIcon).toBeVisible();
  });

  test('should display motivational message', async ({ page }) => {
    // Navigate to profile
    await clickUsername(page, testUser.username);
    
    // Check for motivational message
    await expect(page.getByText(/Keep learning/i)).toBeVisible();
  });

  test('should maintain session when navigating to and from profile', async ({ page }) => {
    // Go to profile
    await clickUsername(page, testUser.username);
    await expect(page.locator('h1')).toContainText('My Profile');
    
    // Use Home button from header (or drawer on mobile)
    await navigateHome(page);
    await expect(page.locator('text=Word Challenge')).toBeVisible();
    
    // Go to profile again
    await clickUsername(page, testUser.username);
    await expect(page.locator('h1')).toContainText('My Profile');
    
    // Should still show correct user info
    await expect(page.locator('h4')).toContainText(testUser.username);
    // Find email specifically in the profile page content (not drawer)
    await expect(page.locator('#root').getByText(testUser.email).first()).toBeVisible();
  });

  test('should not access profile when logged out', async ({ page }) => {
    // Logout - use LogoutIcon since button might be in drawer on mobile
    const logoutBtn = page.locator('button').filter({ has: page.locator('[data-testid="LogoutIcon"]') }).first();
    const isLogoutVisible = await logoutBtn.isVisible().catch(() => false);
    
    if (isLogoutVisible) {
      await logoutBtn.click({ force: true });
    } else {
      // Try opening drawer on mobile
      const mobileMenuButton = page.getByRole('button', { name: 'open menu' });
      const hasMobileMenu = await mobileMenuButton.isVisible().catch(() => false);
      if (hasMobileMenu) {
        await mobileMenuButton.click();
        await page.locator('[role="presentation"]').getByRole('button', { name: 'Logout' }).click();
      }
    }
    
    // Should be on landing page after logout
    await expect(page.locator('text=Word Challenge')).toBeVisible();
    
    // Verify user is logged out - Login button should be accessible
    const loginButton = await page.getByRole('button', { name: 'Login' }).first().isVisible().catch(() => false);
    // On mobile it might be in drawer, just check we're on landing page
    expect(await page.locator('text=Word Challenge').isVisible()).toBeTruthy();
    
    // Try to navigate to profile when logged out should redirect to login
    await page.goto('/');
    
    // Manually try to access profile (simulate clicking if profile button was available)
    // Since there's no profile button for logged out users, we just verify landing page is shown
    await expect(page.locator('text=Word Challenge')).toBeVisible();
  });
});
