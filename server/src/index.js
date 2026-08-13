import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Op, fn, col, literal } from 'sequelize';
import { sequelize, User, Store, Rating } from './models.js';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 4000;
const SECRET = process.env.JWT_SECRET || 'local-development-secret-change-me';
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json());

const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const passwordOk = /^(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,16}$/;
function validateUser({ name, email, address, password }, passwordRequired = true) {
  const errors = {};
  if (!name || name.trim().length < 20 || name.trim().length > 60) errors.name = 'Name must be 20 to 60 characters.';
  if (!emailOk.test(email || '')) errors.email = 'Enter a valid email address.';
  if (!address || address.trim().length > 400) errors.address = 'Address is required and must be 400 characters or fewer.';
  if (passwordRequired && !passwordOk.test(password || '')) errors.password = 'Use 8–16 characters with an uppercase letter and a special character.';
  return errors;
}
function tokenFor(user) { return jwt.sign({ id: user.id, role: user.role }, SECRET, { expiresIn: '8h' }); }
function safeUser(user) { const { passwordHash, ...safe } = user.toJSON(); return safe; }
function auth(req, res, next) {
  try { req.user = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), SECRET); next(); }
  catch { res.status(401).json({ message: 'Your session has expired. Please sign in again.' }); }
}
const allow = (...roles) => (req, res, next) => roles.includes(req.user.role) ? next() : res.status(403).json({ message: 'You do not have access to this resource.' });

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.post('/api/auth/signup', async (req, res, next) => {
  try {
    const errors = validateUser(req.body); if (Object.keys(errors).length) return res.status(422).json({ errors });
    if (await User.findOne({ where: { email: req.body.email.toLowerCase() } })) return res.status(409).json({ errors: { email: 'An account with this email already exists.' } });
    const user = await User.create({ name: req.body.name.trim(), email: req.body.email.toLowerCase(), address: req.body.address.trim(), passwordHash: await bcrypt.hash(req.body.password, 12), role: 'USER' });
    res.status(201).json({ token: tokenFor(user), user: safeUser(user) });
  } catch (e) { next(e); }
});
app.post('/api/auth/login', async (req, res, next) => {
  try {
    const user = await User.findOne({ where: { email: (req.body.email || '').toLowerCase() } });
    if (!user || !await bcrypt.compare(req.body.password || '', user.passwordHash)) return res.status(401).json({ message: 'Incorrect email or password.' });
    res.json({ token: tokenFor(user), user: safeUser(user) });
  } catch (e) { next(e); }
});
app.get('/api/auth/me', auth, async (req, res, next) => { try { res.json(safeUser(await User.findByPk(req.user.id))); } catch (e) { next(e); } });
app.patch('/api/auth/password', auth, async (req, res, next) => {
  try { if (!passwordOk.test(req.body.password || '')) return res.status(422).json({ errors: { password: 'Use 8–16 characters with an uppercase letter and a special character.' } }); const user = await User.findByPk(req.user.id); await user.update({ passwordHash: await bcrypt.hash(req.body.password, 12) }); res.json({ message: 'Password updated successfully.' }); } catch (e) { next(e); }
});

app.get('/api/admin/summary', auth, allow('ADMIN'), async (_req, res, next) => { try { res.json({ users: await User.count(), stores: await Store.count(), ratings: await Rating.count() }); } catch (e) { next(e); } });
app.get('/api/admin/users', auth, allow('ADMIN'), async (req, res, next) => {
  try { const { name = '', email = '', address = '', role = '', sort = 'name', order = 'ASC' } = req.query; const where = { name: { [Op.like]: `%${name}%` }, email: { [Op.like]: `%${email}%` }, address: { [Op.like]: `%${address}%` } }; if (role) where.role = role; const fields = ['name', 'email', 'address', 'role']; const users = await User.findAll({ where, attributes: { exclude: ['passwordHash'] }, order: [[fields.includes(sort) ? sort : 'name', order === 'DESC' ? 'DESC' : 'ASC']] }); res.json(users); } catch (e) { next(e); }
});
app.get('/api/admin/users/:id', auth, allow('ADMIN'), async (req, res, next) => { try { const user = await User.findByPk(req.params.id, { attributes: { exclude: ['passwordHash'] }, include: [{ model: Store, as: 'ownedStores', attributes: ['id'] }] }); if (!user) return res.status(404).json({ message: 'User not found.' }); const result = user.toJSON(); if (user.role === 'OWNER') { const storeIds = result.ownedStores.map(s => s.id); result.rating = storeIds.length ? Number((await Rating.findOne({ where: { storeId: storeIds }, attributes: [[fn('AVG', col('value')), 'average']] })).get('average') || 0) : 0; } res.json(result); } catch (e) { next(e); } });
app.post('/api/admin/users', auth, allow('ADMIN'), async (req, res, next) => { try { const errors = validateUser(req.body); if (Object.keys(errors).length) return res.status(422).json({ errors }); const role = ['ADMIN', 'USER', 'OWNER'].includes(req.body.role) ? req.body.role : 'USER'; if (await User.findOne({ where: { email: req.body.email.toLowerCase() } })) return res.status(409).json({ errors: { email: 'An account with this email already exists.' } }); const user = await User.create({ name: req.body.name.trim(), email: req.body.email.toLowerCase(), address: req.body.address.trim(), passwordHash: await bcrypt.hash(req.body.password, 12), role }); res.status(201).json(safeUser(user)); } catch (e) { next(e); } });
app.get('/api/stores', auth, async (req, res, next) => {
  try { const { search = '', sort = 'name', order = 'ASC' } = req.query; const where = search ? { [Op.or]: [{ name: { [Op.like]: `%${search}%` } }, { address: { [Op.like]: `%${search}%` } }] } : {}; const fields = ['name', 'email', 'address']; const stores = await Store.findAll({ where, attributes: { exclude: ['createdAt', 'updatedAt'], include: [[fn('AVG', col('Ratings.value')), 'averageRating'], [literal(`(SELECT value FROM Ratings WHERE Ratings.storeId = Store.id AND Ratings.userId = ${Number(req.user.id)})`), 'myRating']] }, include: [{ model: Rating, attributes: [] }], group: ['Store.id'], order: [[fields.includes(sort) ? sort : 'name', order === 'DESC' ? 'DESC' : 'ASC']] }); res.json(stores.map(s => ({ ...s.toJSON(), averageRating: Number(s.get('averageRating') || 0), myRating: s.get('myRating') ? Number(s.get('myRating')) : null }))); } catch (e) { next(e); }
});
app.post('/api/admin/stores', auth, allow('ADMIN'), async (req, res, next) => { try { const { name, email, address, ownerId } = req.body; if (!name || !emailOk.test(email || '') || !address || address.length > 400) return res.status(422).json({ message: 'Enter a store name, a valid email, and an address up to 400 characters.' }); if (ownerId) { const owner = await User.findOne({ where: { id: ownerId, role: 'OWNER' } }); if (!owner) return res.status(422).json({ message: 'Select a valid store owner.' }); } res.status(201).json(await Store.create({ name: name.trim(), email: email.toLowerCase(), address: address.trim(), ownerId: ownerId || null })); } catch (e) { next(e); } });
app.put('/api/stores/:id/rating', auth, allow('USER'), async (req, res, next) => { try { const value = Number(req.body.value); if (!Number.isInteger(value) || value < 1 || value > 5) return res.status(422).json({ message: 'Rating must be a whole number from 1 to 5.' }); if (!await Store.findByPk(req.params.id)) return res.status(404).json({ message: 'Store not found.' }); const [rating] = await Rating.upsert({ userId: req.user.id, storeId: req.params.id, value }); res.json(rating); } catch (e) { next(e); } });
app.get('/api/owner/dashboard', auth, allow('OWNER'), async (req, res, next) => { try { const stores = await Store.findAll({ where: { ownerId: req.user.id } }); const ids = stores.map(s => s.id); const ratings = ids.length ? await Rating.findAll({ where: { storeId: ids }, include: [{ model: User, attributes: ['id', 'name', 'email'] }, { model: Store, attributes: ['name'] }], order: [['createdAt', 'DESC']] }) : []; const average = ids.length ? Number((await Rating.findOne({ where: { storeId: ids }, attributes: [[fn('AVG', col('value')), 'average']] })).get('average') || 0) : 0; res.json({ stores, averageRating: average, ratings }); } catch (e) { next(e); } });

app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ message: 'Something went wrong. Please try again.' }); });

async function bootstrap() { await sequelize.sync(); const email = process.env.ADMIN_EMAIL || 'admin@storeratings.local'; if (!await User.findOne({ where: { email } })) await User.create({ name: process.env.ADMIN_NAME || 'Platform Administrator', email, address: 'Platform Operations, 100 Market Street, Bengaluru', passwordHash: await bcrypt.hash(process.env.ADMIN_PASSWORD || 'Admin@123', 12), role: 'ADMIN' }); app.listen(PORT, () => console.log(`API ready on http://localhost:${PORT}`)); }
bootstrap().catch(error => { console.error('Database connection failed:', error.message); process.exit(1); });
