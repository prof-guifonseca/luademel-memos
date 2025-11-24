const fs = require('fs');
const path = require('path');
const express = require('express');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

/*
 * Backend server for the shared memories PWA.
 *
 * This simple Express server provides minimal authentication based on a fixed set
 * of users defined via environment variables. After logging in, users can
 * create, read, update and delete memories containing text, dates, tags,
 * locations and uploaded media. Each memory can receive comments and
 * reactions. Memories, comments and reactions are persisted to a JSON file
 * on disk and media files are stored in an uploads/ directory. An export
 * endpoint returns the entire dataset as JSON together with fully qualified
 * URLs to the stored media. Basic rate limiting and CORS headers are
 * configured to help secure the application.
 */

const app = express();
const PORT = process.env.PORT || 3000;

// -----------------------------------------------------------------------------
// Configuration and helpers
//
// Allowed users are configured via the USERS environment variable, which
// accepts a JSON object mapping usernames to plain text passwords. If not
// provided, a default admin account is created. Example:
//   USERS='{"gui":"senha123","carina":"senha123"}'
// Definição de usuários permitidos para autenticação. Caso a variável
// de ambiente USERS não esteja definida, criamos contas padrão para
// Carina e Gui conforme solicitado. Essas credenciais podem ser
// substituídas definindo USERS como um JSON de pares "usuário:senha".
const USERS = process.env.USERS
  ? (() => {
      try {
        return JSON.parse(process.env.USERS);
      } catch (err) {
        console.warn('Unable to parse USERS env var, falling back to default users');
        return { carina: 'amore', gui: 'amoreGui', admin: 'password' };
      }
    })()
  : { carina: 'amore', gui: 'amoreGui', admin: 'password' };

// Location of the JSON file that stores memories and comments. If the file
// doesn't exist it will be created on first access.
const dbFile = path.join(__dirname, 'database.json');

// Ensure the uploads directory exists at startup. All uploaded media will be
// stored here and served statically under the /uploads route.
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

/**
 * Load the current contents of the database file. If the file does not
 * exist, initialise it with empty arrays for memories and comments.
 *
 * @returns {{memories: any[], comments: any[]}}
 */
function loadDB() {
  if (!fs.existsSync(dbFile)) {
    fs.writeFileSync(dbFile, JSON.stringify({ memories: [], comments: [] }, null, 2));
  }
  const raw = fs.readFileSync(dbFile);
  return JSON.parse(raw);
}

/**
 * Persist the provided database object to disk. Writes synchronously to
 * simplify consistency; for more demanding workloads consider an async API.
 *
 * @param {object} data
 */
function saveDB(data) {
  fs.writeFileSync(dbFile, JSON.stringify(data, null, 2));
}

// -----------------------------------------------------------------------------
// Express middleware setup
//
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static assets in the project root, including HTML and JS for the
// front-end. Without this, Express would not be aware of our static
// memories.html page and related scripts.
app.use(express.static(path.join(__dirname, './')));

// Configure session handling using cookies. Sessions are stored in memory
// which is sufficient for this small application. When running behind HTTPS
// in production, set cookie.secure to true.
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'supersecretkey',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false, // set to true when deploying behind HTTPS
    },
  })
);

// Basic rate limiting to reduce brute force and denial of service attacks.
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
app.use(limiter);

// Restrict cross-origin requests to a single origin. In development the app
// typically runs on http://localhost:3000; customise the ORIGIN env var
// accordingly when deploying. Credentials are allowed so cookies can be sent.
const allowedOrigin = process.env.ORIGIN || 'http://localhost:' + PORT;
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Configure Multer for file uploads. Files are stored in the uploads
// directory with a UUID filename to avoid collisions. File sizes are
// constrained to 10 MB and only common image/video extensions are allowed.
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, uuidv4() + ext);
  },
});

function fileFilter(_req, file, cb) {
  const allowed = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp4', '.mov', '.mkv', '.avi'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Tipo de arquivo inválido: ' + ext));
  }
}

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter,
});

// Authentication middleware: ensures a logged in session exists. Responds
// with 401 if the user is not authenticated.
function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    next();
  } else {
    res.status(401).json({ error: 'Não autorizado' });
  }
}

// -----------------------------------------------------------------------------
// Authentication routes
//
// POST /auth/login – Authenticate a user given username and password. On
// success, the username is stored in the session. Invalid credentials
// receive a 401 response.
app.post('/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
  }
  if (USERS[username] && USERS[username] === password) {
    req.session.user = { username };
    return res.json({ message: 'Login realizado com sucesso' });
  }
  return res.status(401).json({ error: 'Credenciais inválidas' });
});

// POST /auth/logout – Destroy the current session.
app.post('/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ message: 'Logout efetuado' });
  });
});

// GET /auth/me – Return the logged in username, if any.
app.get('/auth/me', (req, res) => {
  if (req.session && req.session.user) {
    res.json({ user: req.session.user.username });
  } else {
    res.json({ user: null });
  }
});

// -----------------------------------------------------------------------------
// Memory CRUD routes
//
// GET /memories – List all memories accessible to the user. Supports
// filtering by tag, status, text search and date range via query params.
app.get('/memories', requireAuth, (req, res) => {
  const db = loadDB();
  let memories = db.memories;
  const { tag, status, q, from, to, day } = req.query;
  if (tag) {
    const tagLower = String(tag).toLowerCase();
    memories = memories.filter((m) => m.tags && m.tags.some((t) => t.toLowerCase() === tagLower));
  }
  if (status) {
    memories = memories.filter((m) => m.status === status);
  }
  // Permite filtrar por "day" (dia do itinerário). Se um dia específico for fornecido
  // via query param, retornamos apenas memórias associadas a esse dia. O campo
  // day é armazenado como string ou número, então convertemos ambos para string
  // para a comparação. Valores vazios ou nulos são ignorados.
  if (day !== undefined && day !== null && String(day).trim() !== '') {
    const dayStr = String(day);
    memories = memories.filter((m) => m.day !== undefined && m.day !== null && String(m.day) === dayStr);
  }
  if (from) {
    const fromDate = new Date(from);
    memories = memories.filter((m) => new Date(m.date) >= fromDate);
  }
  if (to) {
    const toDate = new Date(to);
    memories = memories.filter((m) => new Date(m.date) <= toDate);
  }
  if (q) {
    const search = String(q).toLowerCase();
    memories = memories.filter(
      (m) =>
        (m.title && m.title.toLowerCase().includes(search)) ||
        (m.text && m.text.toLowerCase().includes(search))
    );
  }
  res.json(memories);
});

// POST /memories – Create a new memory. Accepts multipart/form-data with
// optional media files. Required fields: title. Tags may be provided as
// comma-separated strings or an array. Date defaults to now.
app.post('/memories', requireAuth, upload.array('media'), (req, res) => {
  const { title, text, date, tags, location, status } = req.body;
  // O campo day representa o dia do itinerário associado a esta memória (opcional).
  const { day } = req.body;
  if (!title) {
    return res.status(400).json({ error: 'Título é obrigatório' });
  }
  const mediaFiles = req.files ? req.files.map((f) => '/uploads/' + path.basename(f.path)) : [];
  const db = loadDB();
  const memory = {
    id: uuidv4(),
    user: req.session.user.username,
    title: String(title),
    text: text ? String(text) : '',
    date: date ? String(date) : new Date().toISOString(),
    tags: tags
      ? Array.isArray(tags)
        ? tags
        : String(tags)
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s)
      : [],
    location: location ? String(location) : '',
    status: status ? String(status) : 'draft',
    media: mediaFiles,
    day: day !== undefined && day !== null && String(day).trim() !== '' ? isNaN(Number(day)) ? String(day) : Number(day) : undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    reactions: {},
  };
  db.memories.push(memory);
  saveDB(db);
  res.json(memory);
});

// GET /memories/:id – Retrieve a memory by ID along with its comments.
app.get('/memories/:id', requireAuth, (req, res) => {
  const db = loadDB();
  const memory = db.memories.find((m) => m.id === req.params.id);
  if (!memory) {
    return res.status(404).json({ error: 'Memória não encontrada' });
  }
  const comments = db.comments.filter((c) => c.memoryId === memory.id);
  res.json({ ...memory, comments });
});

// PUT /memories/:id – Update a memory. Only the author can update. Uploaded
// files are appended to the existing media array. Fields omitted in the
// request are ignored.
app.put('/memories/:id', requireAuth, upload.array('media'), (req, res) => {
  const db = loadDB();
  const idx = db.memories.findIndex((m) => m.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Memória não encontrada' });
  }
  const mem = db.memories[idx];
  if (mem.user !== req.session.user.username) {
    return res.status(403).json({ error: 'Acesso negado' });
  }
  const { title, text, date, tags, location, status } = req.body;
  const { day } = req.body;
  if (title !== undefined) mem.title = String(title);
  if (text !== undefined) mem.text = String(text);
  if (date !== undefined) mem.date = String(date);
  if (tags !== undefined) {
    mem.tags = Array.isArray(tags)
      ? tags
      : String(tags)
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s);
  }
  if (location !== undefined) mem.location = String(location);
  if (status !== undefined) mem.status = String(status);
  // Permite atualizar o campo day se fornecido (ex.: mover memória para outro dia).
  if (day !== undefined) {
    if (day === null || String(day).trim() === '') {
      mem.day = undefined;
    } else {
      mem.day = isNaN(Number(day)) ? String(day) : Number(day);
    }
  }
  if (req.files && req.files.length > 0) {
    const newFiles = req.files.map((f) => '/uploads/' + path.basename(f.path));
    mem.media = mem.media.concat(newFiles);
  }
  mem.updatedAt = new Date().toISOString();
  db.memories[idx] = mem;
  saveDB(db);
  res.json(mem);
});

// DELETE /memories/:id – Remove a memory and its associated comments. Only
// the author may delete. Uploaded media files are removed from disk.
app.delete('/memories/:id', requireAuth, (req, res) => {
  const db = loadDB();
  const idx = db.memories.findIndex((m) => m.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Memória não encontrada' });
  }
  const mem = db.memories[idx];
  if (mem.user !== req.session.user.username) {
    return res.status(403).json({ error: 'Acesso negado' });
  }
  // Remove uploaded files for this memory
  mem.media.forEach((p) => {
    const filePath = path.join(__dirname, p);
    try {
      fs.unlinkSync(filePath);
    } catch (_err) {
      // ignore missing files
    }
  });
  db.memories.splice(idx, 1);
  // Remove comments tied to this memory
  db.comments = db.comments.filter((c) => c.memoryId !== mem.id);
  saveDB(db);
  res.json({ message: 'Memória excluída' });
});

// -----------------------------------------------------------------------------
// Comment and reaction endpoints
//
// POST /memories/:id/comments – Add a comment to a memory.
app.post('/memories/:id/comments', requireAuth, (req, res) => {
  const { text } = req.body;
  if (!text || !String(text).trim()) {
    return res.status(400).json({ error: 'Comentário vazio' });
  }
  const db = loadDB();
  const memory = db.memories.find((m) => m.id === req.params.id);
  if (!memory) {
    return res.status(404).json({ error: 'Memória não encontrada' });
  }
  const comment = {
    id: uuidv4(),
    memoryId: memory.id,
    user: req.session.user.username,
    text: String(text),
    createdAt: new Date().toISOString(),
    reactions: {},
  };
  db.comments.push(comment);
  saveDB(db);
  res.json(comment);
});

// GET /memories/:id/comments – List comments for a specific memory.
app.get('/memories/:id/comments', requireAuth, (req, res) => {
  const db = loadDB();
  const comments = db.comments.filter((c) => c.memoryId === req.params.id);
  res.json(comments);
});

// POST /memories/:id/reactions – Add a reaction to a memory. The body must
// include an emoji string. Reactions are aggregated counts (per emoji).
app.post('/memories/:id/reactions', requireAuth, (req, res) => {
  const { emoji } = req.body;
  if (!emoji) {
    return res.status(400).json({ error: 'Emoji é obrigatório' });
  }
  const db = loadDB();
  const memory = db.memories.find((m) => m.id === req.params.id);
  if (!memory) {
    return res.status(404).json({ error: 'Memória não encontrada' });
  }
  memory.reactions[emoji] = (memory.reactions[emoji] || 0) + 1;
  saveDB(db);
  res.json(memory.reactions);
});

// POST /comments/:id/reactions – Add a reaction to a comment.
app.post('/comments/:id/reactions', requireAuth, (req, res) => {
  const { emoji } = req.body;
  if (!emoji) {
    return res.status(400).json({ error: 'Emoji é obrigatório' });
  }
  const db = loadDB();
  const comment = db.comments.find((c) => c.id === req.params.id);
  if (!comment) {
    return res.status(404).json({ error: 'Comentário não encontrado' });
  }
  comment.reactions[emoji] = (comment.reactions[emoji] || 0) + 1;
  saveDB(db);
  res.json(comment.reactions);
});

// -----------------------------------------------------------------------------
// Export
//
// GET /export – Return the entire memories database as JSON. Media URLs
// are fully qualified so they can be downloaded easily by the client. Only
// authenticated users can export data.
app.get('/export', requireAuth, (req, res) => {
  const db = loadDB();
  const origin = req.protocol + '://' + req.get('host');
  const data = db.memories.map((m) => {
    return {
      ...m,
      mediaLinks: m.media.map((p) => origin + p),
      comments: db.comments.filter((c) => c.memoryId === m.id),
    };
  });
  res.json(data);
});

// -----------------------------------------------------------------------------
// Static file serving
//
// Expose the uploads folder so the frontend can display uploaded images and
// videos. Files are served as-is; in a production environment consider
// adding caching headers or authentication.
app.use('/uploads', express.static(uploadsDir));

// -----------------------------------------------------------------------------
// Start the server
//
app.listen(PORT, () => {
  console.log(`Servidor iniciado na porta ${PORT}`);
});