import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import User from '../models/User.js';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID || 'your_google_client_id_here');

const isProd = process.env.NODE_ENV === 'production';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true, // Keep true for most envs but note it requires HTTPS
  sameSite: 'none', // Required for cross-site
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

// Adjust for local development if not using HTTPS
if (!isProd) {
  COOKIE_OPTIONS.secure = false;
  COOKIE_OPTIONS.sameSite = 'lax';
}


/**
 * POST /api/auth/register
 * Hash password with bcrypt, create user, return JWT in httpOnly cookie.
 */
export const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required' });
    }

    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(409).json({ message: 'Email already registered' });

    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await User.create({ name, email, passwordHash });

    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('token', token, COOKIE_OPTIONS);
    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ message: 'Server error during registration' });
  }
};

/**
 * POST /api/auth/login
 * Verify password, return JWT in httpOnly cookie.
 */
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('token', token, COOKIE_OPTIONS);
    res.status(200).json({
      message: 'Logged in successfully',
      token,
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error during login' });
  }
};

/**
 * POST /api/auth/google
 * Verify Google ID token, find/create user, return JWT in cookie.
 */
export const googleLogin = async (req, res) => {
  try {
    const { token } = req.body; // This is the access_token from useGoogleLogin
    if (!token) return res.status(400).json({ message: 'Google token is required' });

    // Fetch user info from Google using the access token
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (!userInfoResponse.ok) {
      throw new Error('Failed to fetch user info from Google');
    }
    
    const payload = await userInfoResponse.json();
    const { email, name, sub: googleId, email_verified } = payload;

    // Only trust Google-verified emails — otherwise an attacker could link
    // to an existing account by claiming an unverified address.
    if (email_verified === false || email_verified === 'false') {
      return res.status(401).json({ message: 'Google account email is not verified' });
    }

    let user = await User.findOne({ email });
    
    if (!user) {
      user = await User.create({ name, email, googleId });
    } else if (!user.googleId) {
      user.googleId = googleId;
      await user.save();
    }

    const jwtToken = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('token', jwtToken, COOKIE_OPTIONS);
    res.status(200).json({
      message: 'Logged in with Google successfully',
      token: jwtToken,
      user: { id: user._id, name: user.name, email: user.email, targetRoles: user.targetRoles || [] },
    });
  } catch (err) {
    console.error('Google login error:', err);
    res.status(500).json({ message: 'Server error during Google login' });
  }
};

/**
 * POST /api/auth/logout
 * Clear the httpOnly cookie.
 */
export const logout = (_req, res) => {
  res.clearCookie('token', COOKIE_OPTIONS);
  res.status(200).json({ message: 'Logged out successfully' });
};

/**
 * GET /api/auth/me
 * Return the current user. Auth is handled by the `protect` middleware,
 * which populates req.user from the Bearer token (or cookie fallback).
 */
export const me = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-passwordHash');
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.status(200).json({ user: { id: user._id, name: user.name, email: user.email, targetRoles: user.targetRoles } });
  } catch (err) {
    res.status(500).json({ message: 'Server error fetching profile' });
  }
};

/**
 * PUT /api/auth/update
 * Update the user's email, password, or targetRoles.
 */
export const updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const { email, password, targetRoles } = req.body;

    if (email) user.email = email;
    if (targetRoles) user.targetRoles = targetRoles;
    
    if (password) {
      const salt = await bcrypt.genSalt(12);
      user.passwordHash = await bcrypt.hash(password, salt);
    }

    await user.save();

    res.status(200).json({
      message: 'Profile updated successfully',
      user: { id: user._id, name: user.name, email: user.email, targetRoles: user.targetRoles }
    });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ message: 'Server error during profile update' });
  }
};
