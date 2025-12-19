import { Page } from '@playwright/test';

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
  
  // Wait for landing page to load
  await page.waitForSelector('h1:has-text("Welcome")', { timeout: 5000 });
  
  // Navigate to register page from landing page
  await page.getByRole('button', { name: 'Register' }).click();
  
  // Wait for register page to load
  await page.waitForSelector('h1:has-text("Register")', { timeout: 5000 });
  
  // Fill in registration form
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').first().fill(password);
  await page.getByLabel('Confirm Password').fill(password);
  
  // Submit form
  await page.getByRole('button', { name: /Register/i }).click();
  
  // Wait for landing page to load - check for Welcome message with username
  await page.waitForSelector('h1:has-text("Welcome")', { timeout: 10000 });
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
  await page.waitForSelector('h1:has-text("Welcome")', { timeout: 5000 });
  await page.getByRole('button', { name: 'Login' }).click();
  await page.waitForSelector('h1:has-text("Login")', { timeout: 5000 });
  
  // Fill in login form
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  
  // Submit form
  await page.getByRole('button', { name: /Login/i }).click();
  
  // Wait for landing page to load - check for Welcome message
  await page.waitForSelector('h1:has-text("Welcome")', { timeout: 10000 });
}

/**
 * Helper function to logout
 */
export async function logout(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Logout/i }).click();
  
  // Wait for landing page to load (logout now redirects to landing page)
  await page.waitForSelector('h1:has-text("Welcome")', { timeout: 5000 });
}
