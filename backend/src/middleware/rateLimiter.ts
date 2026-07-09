import { Request, Response, NextFunction } from 'express';

interface RateLimitInfo {
  timestamps: number[];
}

const ipCache = new Map<string, RateLimitInfo>();

// Clean up old cache entries periodically to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  for (const [ip, info] of ipCache.entries()) {
    info.timestamps = info.timestamps.filter(ts => now - ts < oneHour);
    if (info.timestamps.length === 0) {
      ipCache.delete(ip);
    }
  }
}, 5 * 60 * 1000); // Clean up every 5 minutes

export const rateLimiter = (maxRequests: number, windowMs: number) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown';
    const now = Date.now();

    let info = ipCache.get(ip);
    if (!info) {
      info = { timestamps: [] };
      ipCache.set(ip, info);
    }

    // Filter out timestamps older than the window
    info.timestamps = info.timestamps.filter(ts => now - ts < windowMs);

    if (info.timestamps.length >= maxRequests) {
      const oldest = info.timestamps[0];
      const resetTime = Math.ceil((oldest + windowMs - now) / 1000);
      res.setHeader('Retry-After', resetTime);
      return res.status(429).json({
        error: 'Demasiadas solicitudes. Por favor, inténtelo de nuevo más tarde.',
        retryAfterSeconds: resetTime
      });
    }

    info.timestamps.push(now);
    next();
  };
};
