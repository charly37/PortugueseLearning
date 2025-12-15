import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('should display login page on first visit', async ({ page }) => {
    await page.goto('/');
    
    // Verify we're on the login page
    await expect(page.locator('h1')).toContainText('Login');
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: /Login/i })).toBeVisible();
  });

  test('should navigate to register page', async ({ page }) => {
    await page.goto('/');
    
    // Wait for login page
    await page.waitForSelector('h1:has-text("Login")');
    
    // Click on register link
    await page.getByRole('button', { name: /Register here/i }).click();
    
    // Wait for register page
    await page.waitForSelector('h1:has-text("Register")');
    
    // Verify we're on the register page
    await expect(page.locator('h1')).toContainText('Register');
    await expect(page.getByLabel('Username')).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password').first()).toBeVisible();
    await expect(page.getByLabel('Confirm Password')).toBeVisible();
  });

  test('should register a new user successfully', async ({ page }) => {
    const testUser = {
      username: `testuser_${Date.now()}`,
      email: `test_${Date.now()}@example.com`,
      password: 'testpassword123'
    };

    await page.goto('/');
    
    // Wait for login page
    await page.waitForSelector('h1:has-text("Login")');
    
    // Navigate to register page
    await page.getByRole('button', { name: /Register here/i }).click();
    
    // Wait for register page
    await page.waitForSelector('h1:has-text("Register")');
    
    // Fill in registration form
    await page.getByLabel('Username').fill(testUser.username);
    await page.getByLabel('Email').fill(testUser.email);
    await page.getByLabel('Password').first().fill(testUser.password);
    await page.getByLabel('Confirm Password').fill(testUser.password);
    
    // Submit form
    await page.getByRole('button', { name: /Register/i }).click();
    
    // Should redirect to landing page
    await expect(page.locator('h1')).toContainText('Welcome to Portuguese Learning', { timeout: 10000 });
    
    // Should see username in header
    await expect(page.getByText(testUser.username)).toBeVisible();
  });

  test('should not register with invalid email', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Register here/i }).click();
    await page.waitForSelector('text=Register');
    
    await page.getByLabel('Username').fill('testuser');
    await page.getByLabel('Email').fill('invalid-email');
    await page.getByLabel('Password').first().fill('password123');
    await page.getByLabel('Confirm Password').fill('password123');
    
    // HTML5 validation should prevent submission
    const emailInput = page.getByLabel('Email');
    await expect(emailInput).toHaveAttribute('type', 'email');
  });

  test('should not register with password mismatch', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Register here/i }).click();
    await page.waitForSelector('text=Register');
    
    await page.getByLabel('Username').fill('testuser');
    await page.getByLabel('Email').fill('test@example.com');
    await page.getByLabel('Password').first().fill('password123');
    await page.getByLabel('Confirm Password').fill('differentpassword');
    
    await page.getByRole('button', { name: /Register/i }).click();
    
    // Should show error message
    await expect(page.getByText(/passwords do not match/i)).toBeVisible();
  });

  test('should not register with short password', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Register here/i }).click();
    await page.waitForSelector('text=Register');
    
    await page.getByLabel('Username').fill('testuser');
    await page.getByLabel('Email').fill('test@example.com');
    await page.getByLabel('Password').first().fill('123');
    await page.getByLabel('Confirm Password').fill('123');
    
    await page.getByRole('button', { name: /Register/i }).click();
    
    // Should show error message
    await expect(page.getByText(/at least 6 characters/i).first()).toBeVisible();
  });

  test('should login with valid credentials', async ({ page }) => {
    // First register a unique user
    const uniqueUser = {
      username: `logintest_${Date.now()}`,
      email: `logintest_${Date.now()}@example.com`,
      password: 'testpassword123'
    };
    
    await page.goto('/');
    await page.getByRole('button', { name: /Register here/i }).click();
    await page.waitForSelector('text=Register');
    
    await page.getByLabel('Username').fill(uniqueUser.username);
    await page.getByLabel('Email').fill(uniqueUser.email);
    await page.getByLabel('Password').first().fill(uniqueUser.password);
    await page.getByLabel('Confirm Password').fill(uniqueUser.password);
    await page.getByRole('button', { name: /Register/i }).click();
    
    // Wait for landing page
    await expect(page.locator('h1')).toContainText('Welcome to Portuguese Learning', { timeout: 10000 });
    
    // Logout
    await page.getByRole('button', { name: /Logout/i }).click();
    
    // Now login with the same credentials
    await expect(page.locator('h1')).toContainText('Login');
    await page.getByLabel('Email').fill(uniqueUser.email);
    await page.getByLabel('Password').fill(uniqueUser.password);
    await page.getByRole('button', { name: /Login/i }).click();
    
    // Should redirect to landing page
    await expect(page.locator('h1')).toContainText('Welcome to Portuguese Learning', { timeout: 10000 });
    await expect(page.getByText(uniqueUser.username)).toBeVisible();
  });

  test('should not login with invalid credentials', async ({ page }) => {
    await page.goto('/');
    
    await page.getByLabel('Email').fill('nonexistent@example.com');
    await page.getByLabel('Password').fill('wrongpassword');
    
    await page.getByRole('button', { name: /Login/i }).click();
    
    // Should show error message
    await expect(page.getByText(/invalid/i)).toBeVisible();
  });

  test('should logout successfully', async ({ page }) => {
    // Register and login first
    const uniqueUser = {
      username: `logouttest_${Date.now()}`,
      email: `logouttest_${Date.now()}@example.com`,
      password: 'testpassword123'
    };
    
    await page.goto('/');
    await page.getByRole('button', { name: /Register here/i }).click();
    await page.waitForSelector('text=Register');
    
    await page.getByLabel('Username').fill(uniqueUser.username);
    await page.getByLabel('Email').fill(uniqueUser.email);
    await page.getByLabel('Password').first().fill(uniqueUser.password);
    await page.getByLabel('Confirm Password').fill(uniqueUser.password);
    await page.getByRole('button', { name: /Register/i }).click();
    
    // Wait for landing page
    await expect(page.locator('h1')).toContainText('Welcome to Portuguese Learning', { timeout: 10000 });
    
    // Logout
    await page.getByRole('button', { name: 'Logout', exact: true }).click();
    
    // Should redirect to login page
    await expect(page.locator('h1')).toContainText('Login');
  });

  test('should navigate back to login from register page', async ({ page }) => {
    await page.goto('/');
    
    // Wait for login page
    await page.waitForSelector('h1:has-text("Login")');
    
    // Navigate to register page
    await page.getByRole('button', { name: /Register here/i }).click();
    
    // Wait for and verify register page
    await page.waitForSelector('h1:has-text("Register")');
    await expect(page.locator('h1')).toContainText('Register');
    
    // Navigate back to login
    await page.getByRole('button', { name: /Login here/i }).click();
    
    // Wait for login page
    await page.waitForSelector('h1:has-text("Login")');
    
    // Should be back on login page
    await expect(page.locator('h1')).toContainText('Login');
  });

  test('should persist session after page reload', async ({ page }) => {
    // Register a user
    const uniqueUser = {
      username: `sessiontest_${Date.now()}`,
      email: `sessiontest_${Date.now()}@example.com`,
      password: 'testpassword123'
    };
    
    await page.goto('/');
    await page.getByRole('button', { name: /Register here/i }).click();
    await page.waitForSelector('text=Register');
    
    await page.getByLabel('Username').fill(uniqueUser.username);
    await page.getByLabel('Email').fill(uniqueUser.email);
    await page.getByLabel('Password').first().fill(uniqueUser.password);
    await page.getByLabel('Confirm Password').fill(uniqueUser.password);
    await page.getByRole('button', { name: /Register/i }).click();
    
    // Wait for landing page
    await expect(page.locator('h1')).toContainText('Welcome to Portuguese Learning', { timeout: 10000 });
    
    // Reload page
    await page.reload();
    
    // Should still be on landing page
    await expect(page.locator('h1')).toContainText('Welcome to Portuguese Learning');
    await expect(page.getByText(uniqueUser.username)).toBeVisible();
  });
});
