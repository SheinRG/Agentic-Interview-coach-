import jwt from 'jsonwebtoken';

/**
 * Protect routes by verifying the JWT from the Authorization Bearer header.
 * Falls back to cookie for backward compatibility during transition.
 * Attaches the decoded payload (userId, email) to req.user.
 */
const protect = (req, res, next) => {
  let token = null;

  // Primary: read from Authorization header (works on all browsers/cross-domain)
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  // Fallback: read from httpOnly cookie (for backward compat)
  if (!token && req.cookies?.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({ message: 'Not authenticated — no token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { userId, email, iat, exp }
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Not authenticated — invalid token' });
  }
};

export default protect;
