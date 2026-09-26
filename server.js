const express = require('express');
const crypto = require('crypto');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 10000;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const DATABASE_URL = process.env.DATABASE_URL || '';

if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !SESSION_SECRET || !DATABASE_URL) {
  console.warn('Missing required environment variables. Set ADMIN_EMAIL, ADMIN_PASSWORD, SESSION_SECRET and DATABASE_URL in Render.');
}

const pool = DATABASE_URL ? new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } }) : null;

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'));
app.get('/style.css', (req, res) => res.sendFile(__dirname + '/style.css'));
app.get('/app.js', (req, res) => res.sendFile(__dirname + '/app.js'));

function sign(value) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('hex');
}
function makeSession() {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + 1000 * 60 * 60 * 8 })).toString('base64url');
  return payload + '.' + sign(payload);
}
function validSession(req) {
  const raw = (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith('ghg_session='));
  if (!raw) return false;
  const token = raw.slice('ghg_session='.length);
  const [payload, sig] = token.split('.');
  if (!payload || !sig || !SESSION_SECRET) return false;
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  try { return JSON.parse(Buffer.from(payload, 'base64url').toString()).exp > Date.now(); } catch { return false; }
}
function requireAdmin(req, res, next) {
  if (!validSession(req)) return res.status(401).json({ error: 'Unauthorized' });
  next();
}
function clean(value, max = 300) {
  return String(value ?? '').trim().slice(0, max);
}
function makeRef() {
  return 'GHG2026-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}
async function initDb() {
  if (!pool) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS applications (
    id BIGSERIAL PRIMARY KEY,
    reference VARCHAR(32) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL,
    email VARCHAR(254) NOT NULL,
    phone VARCHAR(40) NOT NULL,
    dob DATE NOT NULL,
    state VARCHAR(60) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
}

app.post('/api/applications', async (req, res) => {
  try {
    if (!pool) return res.status(500).json({ error: 'Application storage is not configured.' });
    const name = clean(req.body.name, 150);
    const email = clean(req.body.email, 254).toLowerCase();
    const phone = clean(req.body.phone, 40);
    const dob = clean(req.body.dob, 10);
    const state = clean(req.body.state, 60);
    const citizen = req.body.citizen === true || req.body.citizen === 'true';
    const understands = req.body.understands === true || req.body.understands === 'true';
    if (!name || !email || !phone || !dob || !state || !citizen || !understands) return res.status(400).json({ error: 'Please complete all required fields and confirmations.' });
    const birth = new Date(dob + 'T00:00:00Z');
    if (Number.isNaN(birth.getTime())) return res.status(400).json({ error: 'Please enter a valid date of birth.' });
    const today = new Date();
    let age = today.getUTCFullYear() - birth.getUTCFullYear();
    const m = today.getUTCMonth() - birth.getUTCMonth();
    if (m < 0 || (m === 0 && today.getUTCDate() < birth.getUTCDate())) age--;
    if (age < 18) return res.status(400).json({ error: 'Applicants must be 18 or older.' });
    const deadline = new Date('2026-12-20T23:59:59Z');
    if (today > deadline) return res.status(400).json({ error: 'The application deadline has passed.' });
    let reference;
    for (let i = 0; i < 5; i++) {
      try {
        reference = makeRef();
        await pool.query(`INSERT INTO applications (reference,name,email,phone,dob,state) VALUES ($1,$2,$3,$4,$5,$6)`, [reference,name,email,phone,dob,state]);
        break;
      } catch (e) {
        if (e.code !== '23505' || i === 4) throw e;
      }
    }
    res.json({ ok: true, reference });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'We could not save the application. Please try again.' });
  }
});

app.get('/api/status', async (req, res) => {
  try {
    if (!pool) return res.status(500).json({ error: 'Application storage is not configured.' });
    const reference = clean(req.query.reference, 32).toUpperCase();
    const email = clean(req.query.email, 254).toLowerCase();
    if (!reference || !email) return res.status(400).json({ error: 'Reference number and email are required.' });
    const result = await pool.query('SELECT reference,status,created_at FROM applications WHERE reference=$1 AND email=$2', [reference,email]);
    if (!result.rows.length) return res.status(404).json({ error: 'Application not found.' });
    res.json({ ok: true, application: result.rows[0] });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Unable to check status.' }); }
});

app.post('/api/admin/login', (req, res) => {
  const email = clean(req.body.email, 254);
  const password = String(req.body.password || '');
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD || email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Invalid login.' });
  res.setHeader('Set-Cookie', `ghg_session=${makeSession()}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`);
  res.json({ ok: true });
});
app.post('/api/admin/logout', (req,res) => { res.setHeader('Set-Cookie','ghg_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0'); res.json({ok:true}); });
app.get('/api/admin/me', requireAdmin, (req,res)=>res.json({ok:true,email:ADMIN_EMAIL}));
app.get('/api/admin/applications', requireAdmin, async (req,res)=>{
  try { const r = await pool.query('SELECT id,reference,name,email,phone,dob,state,status,created_at FROM applications ORDER BY created_at DESC'); res.json({ok:true,applications:r.rows}); }
  catch(e){ console.error(e); res.status(500).json({error:'Unable to load applications.'}); }
});
app.patch('/api/admin/applications/:id', requireAdmin, async (req,res)=>{
  try {
    const allowed = ['Pending','Under Review','Approved','Rejected'];
    const status = clean(req.body.status, 20);
    if (!allowed.includes(status)) return res.status(400).json({error:'Invalid status.'});
    const r = await pool.query('UPDATE applications SET status=$1 WHERE id=$2 RETURNING id,reference,status', [status, req.params.id]);
    if (!r.rows.length) return res.status(404).json({error:'Application not found.'});
    res.json({ok:true,application:r.rows[0]});
  } catch(e){ console.error(e); res.status(500).json({error:'Unable to update application.'}); }
});

app.get('/admin', (req,res)=>res.sendFile(__dirname + '/admin.html'));
app.get('/admin.css', (req,res)=>res.sendFile(__dirname + '/admin.css'));
app.get('/admin.js', (req,res)=>res.sendFile(__dirname + '/admin.js'));
app.get('/status.js', (req,res)=>res.sendFile(__dirname + '/status.js'));
initDb().then(()=>app.listen(PORT,'0.0.0.0',()=>console.log(`GREATER HIGH GRANT listening on ${PORT}`))).catch(err=>{console.error('Database initialization failed',err);process.exit(1);});
