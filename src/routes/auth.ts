import express, { Request, Response } from 'express';
import User from '../models/User';

const router = express.Router();

// Extend Express Session type
declare module 'express-session' {
  interface SessionData {
    userId: string;
  }
}

// Register a new user
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { username, email, password, preferredLanguage } = req.body;

    // Validate input
    if (!username || !email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    // Validate preferredLanguage
    if (preferredLanguage && !['fr', 'en'].includes(preferredLanguage)) {
      return res.status(400).json({ message: 'Invalid language preference' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ 
        message: existingUser.email === email ? 'Email already in use' : 'Username already taken' 
      });
    }

    // Create new user
    const user = new User({
      username,
      email,
      password,
      preferredLanguage: preferredLanguage || 'fr'
    });

    await user.save();

    // Set session
    req.session.userId = user._id.toString();

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        isGuest: false,
        preferredLanguage: user.preferredLanguage,
        createdAt: user.createdAt,
        totalScore: user.totalScore,
        level: user.level
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// Login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Set session
    req.session.userId = user._id.toString();

    res.json({
      message: 'Login successful',
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        isGuest: false,
        preferredLanguage: user.preferredLanguage,
        createdAt: user.createdAt,
        totalScore: user.totalScore,
        level: user.level
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// Logout
router.post('/logout', (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ message: 'Error logging out' });
    }
    res.clearCookie('connect.sid');
    res.json({ message: 'Logout successful' });
  });
});

// Check authentication status
router.get('/check-auth', async (req: Request, res: Response) => {
  try {
    if (!req.session.userId) {
      return res.json({ authenticated: false });
    }

    const user = await User.findById(req.session.userId).select('-password');
    if (!user) {
      return res.json({ authenticated: false });
    }

    res.json({
      authenticated: true,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        isGuest: user.isGuest,
        guestExpiresAt: user.guestExpiresAt,
        preferredLanguage: user.preferredLanguage,
        createdAt: user.createdAt,
        totalScore: user.totalScore,
        level: user.level
      }
    });
  } catch (error) {
    console.error('Check auth error:', error);
    res.status(500).json({ message: 'Server error checking authentication' });
  }
});

// Update user's preferred language
router.post('/update-language', async (req: Request, res: Response) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const { preferredLanguage } = req.body;

    if (!preferredLanguage || !['fr', 'en'].includes(preferredLanguage)) {
      return res.status(400).json({ message: 'Invalid language preference' });
    }

    const user = await User.findByIdAndUpdate(
      req.session.userId,
      { preferredLanguage },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      message: 'Language preference updated',
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        isGuest: user.isGuest,
        preferredLanguage: user.preferredLanguage,
        createdAt: user.createdAt,
        totalScore: user.totalScore,
        level: user.level
      }
    });
  } catch (error) {
    console.error('Update language error:', error);
    res.status(500).json({ message: 'Server error updating language' });
  }
});

// Create guest user
router.post('/create-guest', async (req: Request, res: Response) => {
  try {
    // Generate unique guest username
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 6);
    const guestUsername = `guest_${timestamp}_${randomStr}`;

    // Set expiration to 7 days from now
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + 7);

    // Create guest user (don't set email at all - leave it undefined)
    const guestUser = new User({
      username: guestUsername,
      isGuest: true,
      guestExpiresAt: expirationDate,
      preferredLanguage: req.body.preferredLanguage || 'fr'
      // email and password are intentionally not set (undefined, not null)
    });

    await guestUser.save();

    // Set session
    req.session.userId = guestUser._id.toString();

    res.status(201).json({
      message: 'Guest account created successfully',
      user: {
        id: guestUser._id,
        username: guestUser.username,
        email: guestUser.email,
        isGuest: true,
        guestExpiresAt: guestUser.guestExpiresAt,
        preferredLanguage: guestUser.preferredLanguage,
        createdAt: guestUser.createdAt,
        totalScore: guestUser.totalScore,
        level: guestUser.level
      }
    });
  } catch (error) {
    console.error('Create guest error:', error);
    res.status(500).json({ message: 'Server error creating guest account' });
  }
});

// Restore guest session from localStorage
router.post('/restore-guest', async (req: Request, res: Response) => {
  try {
    const { guestUserId } = req.body;

    if (!guestUserId) {
      return res.status(400).json({ message: 'Guest user ID is required' });
    }

    // Find the guest user
    const guestUser = await User.findById(guestUserId).select('-password');
    
    if (!guestUser) {
      return res.status(404).json({ message: 'Guest user not found' });
    }

    if (!guestUser.isGuest) {
      return res.status(400).json({ message: 'User is not a guest account' });
    }

    // Check if guest has expired
    if (guestUser.guestExpiresAt && new Date() > guestUser.guestExpiresAt) {
      return res.status(401).json({ message: 'Guest account has expired' });
    }

    // Restore session
    req.session.userId = guestUser._id.toString();

    res.json({
      message: 'Guest session restored successfully',
      user: {
        id: guestUser._id,
        username: guestUser.username,
        email: guestUser.email,
        isGuest: true,
        guestExpiresAt: guestUser.guestExpiresAt,
        preferredLanguage: guestUser.preferredLanguage,
        createdAt: guestUser.createdAt,
        totalScore: guestUser.totalScore,
        level: guestUser.level
      }
    });
  } catch (error) {
    console.error('Restore guest error:', error);
    res.status(500).json({ message: 'Server error restoring guest session' });
  }
});

// Convert guest user to real account
router.post('/register-from-guest', async (req: Request, res: Response) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const { username, email, password, preferredLanguage } = req.body;

    // Validate input
    if (!username || !email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    // Validate preferredLanguage
    if (preferredLanguage && !['fr', 'en'].includes(preferredLanguage)) {
      return res.status(400).json({ message: 'Invalid language preference' });
    }

    // Get current guest user
    const guestUser = await User.findById(req.session.userId);
    if (!guestUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!guestUser.isGuest) {
      return res.status(400).json({ message: 'User is already a registered account' });
    }

    // Check if email or username already taken
    const existingUser = await User.findOne({
      _id: { $ne: guestUser._id },
      $or: [{ email }, { username }]
    });
    if (existingUser) {
      return res.status(400).json({ 
        message: existingUser.email === email ? 'Email already in use' : 'Username already taken' 
      });
    }

    // Update guest user to real user
    guestUser.username = username;
    guestUser.email = email;
    guestUser.password = password;
    guestUser.isGuest = false;
    guestUser.guestExpiresAt = undefined;
    if (preferredLanguage) {
      guestUser.preferredLanguage = preferredLanguage;
    }

    await guestUser.save();

    res.status(201).json({
      message: 'Account upgraded successfully',
      user: {
        id: guestUser._id,
        username: guestUser.username,
        email: guestUser.email,
        isGuest: false,
        preferredLanguage: guestUser.preferredLanguage,
        createdAt: guestUser.createdAt,
        totalScore: guestUser.totalScore,
        level: guestUser.level
      }
    });
  } catch (error) {
    console.error('Register from guest error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

export default router;
