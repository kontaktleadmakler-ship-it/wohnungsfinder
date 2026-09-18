import jwt from 'jsonwebtoken';
import { env } from './config.js';
export const signToken = (userId) => jwt.sign({ sub: userId }, env.JWT_SECRET, { expiresIn: '15m', issuer: 'wohnungsfinder' });
export function requireAuth(req, res, next) { const token = req.header('authorization')?.replace(/^Bearer\s+/i, ''); if (!token)
    return res.status(401).json({ error: 'Authentifizierung erforderlich.' }); try {
    req.userId = String(jwt.verify(token, env.JWT_SECRET, { issuer: 'wohnungsfinder' }).sub);
    next();
}
catch {
    res.status(401).json({ error: 'Ungültige oder abgelaufene Anmeldung.' });
} }
