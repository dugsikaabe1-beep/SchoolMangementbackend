/**
 * Centralized Redis Configuration
 * ================================
 * Single source of truth for all Redis connections in the application.
 * Optimized for Upstash Redis + BullMQ compatibility.
 *
 * Exports:
 *   - getRedisClient()     → shared IORedis instance (for general use / diagnostics)
 *   - getQueueConnection() → connection object for BullMQ Queue producers
 *   - getWorkerConnection() → connection object for BullMQ Worker consumers
 *   - initRedis()          → called once at startup to connect and log status
 *   - shutdownRedis()      → graceful disconnect on process exit
 */

import IORedis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const REDIS_URL = process.env.REDIS_URL;

// Flag set to true the moment an auth error is detected.
// retryStrategy reads this to stop retrying immediately.
let _authFailed = false;

// True only after initRedis() successfully PINGs the server.
// Queue/Worker code checks this to avoid connecting with bad credentials.
let _redisAvailable = false;

// Set to true when URL validation fails pre-flight.
// Prevents ANY client from being created with bad credentials.
let _validationFailed = false;

// ---------------------------------------------------------------------------
// URL Validation — detect common placeholder / masked values BEFORE connecting
// ---------------------------------------------------------------------------
const PLACEHOLDER_PATTERNS = [
  /^\*+$/,                 // ********  (masked password from dashboard)
  /^x+$/i,                 // xxxxxxxx
  /^password$/i,
  /^your[_-]?password$/i,
  /^changeme$/i,
  /^secret$/i,
  /^<.*>$/,                // <password>
  /^\$\{.*\}$/,           // ${REDIS_PASSWORD}
  /^example/i,
  /^insert[_-]/i,
  /^replace[_-]/i,
];

const detectConfigSource = () => {
  // Identify which file or env source provided REDIS_URL
  if (process.env.RAILWAY_ENVIRONMENT) return `Railway (${process.env.RAILWAY_ENVIRONMENT})`;
  if (process.env.VERCEL) return 'Vercel Environment Variables';
  if (process.env.DOCKER || process.env.DOCKER_CONTAINER) return 'Docker Environment';
  // dotenv loads .env — check if it was the source
  return 'backend/.env (dotenv)';
};

const validateRedisUrl = (url) => {
  const issues = [];
  if (!url) return { valid: false, issues: ['REDIS_URL is empty or not set'] };

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, issues: [`REDIS_URL is not a valid URL: ${url.slice(0, 30)}…`] };
  }

  const username = parsed.username || 'default';
  const password = parsed.password || '';
  const host = parsed.hostname;
  const port = parsed.port;
  const protocol = parsed.protocol;

  // Audit log (secrets masked)
  console.log('[Redis] ── URL Audit ──');
  console.log(`[Redis]   Protocol : ${protocol}`);
  console.log(`[Redis]   Username : ${username}`);
  console.log(`[Redis]   Password : ${password ? `(${password.length} chars) ${password.slice(0, 2)}${'*'.repeat(Math.max(password.length - 2, 0))}` : '(EMPTY)'}`);
  console.log(`[Redis]   Host     : ${host}`);
  console.log(`[Redis]   Port     : ${port || '(default)'}`);
  console.log(`[Redis]   Source   : ${detectConfigSource()}`);

  if (!password) {
    issues.push('Password is EMPTY — URL has no credentials');
  } else {
    for (const pat of PLACEHOLDER_PATTERNS) {
      if (pat.test(password)) {
        issues.push(`Password looks like a placeholder/masked value: "${password}" — replace with the real Upstash password`);
        break;
      }
    }
  }

  if (!host || host === 'localhost') {
    issues.push(`Host is "${host}" — expected an Upstash hostname like *.upstash.io`);
  }

  if (protocol !== 'redis:' && protocol !== 'rediss:') {
    issues.push(`Protocol "${protocol}" is unusual — expected redis: or rediss:`);
  }

  return { valid: issues.length === 0, issues, parsed: { username, host, port, protocol } };
};

// ---------------------------------------------------------------------------
// Shared connection options (Upstash + BullMQ compatible)
// ---------------------------------------------------------------------------
// BullMQ requirement: maxRetriesPerRequest MUST be null, otherwise ioredis
// will throw MaxRetriesPerRequestError when a command is pending during
// reconnection. See: https://docs.bullmq.io/guide/connections
// ---------------------------------------------------------------------------
const BASE_OPTS = {
  maxRetriesPerRequest: null,        // CRITICAL for BullMQ
  enableReadyCheck: true,            // Wait for READY state before accepting cmds
  lazyConnect: true,                 // Don't connect until .connect() is called
  enableOfflineQueue: true,          // Queue commands while connecting
  retryStrategy(times) {
    // ── Fail-fast: stop immediately on authentication failure ──
    if (_authFailed) {
      console.error('[Redis] ⛔ Auth failed — halting all retry attempts.');
      return null; // stop retrying permanently
    }
    if (times > 20) {
      console.error(`[Redis] Retry exhausted after ${times} attempts. Giving up.`);
      return null; // stop retrying
    }
    // Exponential back-off capped at 10 s
    const delay = Math.min(times * 200, 10000);
    console.warn(`[Redis] Reconnecting… attempt ${times}, delay ${delay}ms`);
    return delay;
  },
  reconnectOnError(err) {
    const msg = String(err?.message || err || '').toLowerCase();

    // ── Fail-fast: NEVER reconnect on authentication failures ──
    if (msg.includes('wrongpass') || msg.includes('auth') || msg.includes('noauth')) {
      _authFailed = true; // signal retryStrategy to stop
      console.error('[Redis] ❌ Authentication Failure — wrong credentials in REDIS_URL. Stopping retries.');
      return false; // do NOT reconnect
    }

    // Reconnect on common transient errors
    if (
      msg.includes('readonly') ||
      msg.includes('loading') ||
      msg.includes('closed') ||
      msg.includes('econnreset') ||
      msg.includes('etimedout') ||
      msg.includes('econnrefused')
    ) {
      console.warn(`[Redis] reconnectOnError triggered: ${msg}`);
      return true;
    }
    return false;
  },
};

// Upstash often requires TLS even on port 6379. Detect and apply TLS opts.
const isUpstash = REDIS_URL && REDIS_URL.includes('upstash.io');
const useTls = isUpstash && !REDIS_URL.startsWith('rediss://');

const TLS_OPTS = useTls
  ? { tls: { rejectUnauthorized: false } }
  : {};

const FINAL_OPTS = { ...BASE_OPTS, ...TLS_OPTS };

// ---------------------------------------------------------------------------
// Singleton clients
// ---------------------------------------------------------------------------
let _generalClient = null;   // for diagnostics, ping, pub/sub, etc.
let _queueConnection = null;  // for BullMQ Queue (producer)
let _workerConnection = null; // for BullMQ Worker (consumer)

// ---------------------------------------------------------------------------
// Logging helpers
// ---------------------------------------------------------------------------
const attachListeners = (client, label) => {
  client.on('connect', () => console.log(`[Redis:${label}] Connecting…`));
  client.on('ready', () => console.log(`[Redis:${label}] ✅ Ready`));
  client.on('close', () => console.warn(`[Redis:${label}] Connection closed`));
  client.on('reconnecting', (ms) => console.warn(`[Redis:${label}] Reconnecting in ${ms}ms`));
  client.on('error', (err) => {
    console.error(`[Redis:${label}] ❌ Error:`, err.message);
    // Surface the exact failure type for quick diagnosis
    const msg = err.message.toLowerCase();
    if (msg.includes('auth') || msg.includes('wrong password')) {
      console.error(`[Redis:${label}] → Authentication Failure`);
    } else if (msg.includes('tls') || msg.includes('ssl')) {
      console.error(`[Redis:${label}] → TLS Failure`);
    } else if (msg.includes('closed') || msg.includes('fin')) {
      console.error(`[Redis:${label}] → Connection Closed by server`);
    } else if (msg.includes('maxretriesperrequest')) {
      console.error(`[Redis:${label}] → MaxRetriesPerRequestError (maxRetriesPerRequest not null?)`);
    } else if (msg.includes('econnrefused') || msg.includes('enotfound')) {
      console.error(`[Redis:${label}] → Network Failure (host unreachable)`);
    } else if (msg.includes('retry exhausted') || msg.includes('retry limit')) {
      console.error(`[Redis:${label}] → Retry Exhausted`);
    }
  });
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Shared general-purpose Redis client (diagnostics, pub/sub, manual commands).
 */
export const getRedisClient = () => {
  if (!REDIS_URL || _validationFailed || _authFailed) return null;
  if (!_generalClient) {
    _generalClient = new IORedis(REDIS_URL, { ...FINAL_OPTS });
    attachListeners(_generalClient, 'general');
  }
  return _generalClient;
};

/**
 * Connection object to pass to `new Queue(name, { connection })`.
 * BullMQ requires maxRetriesPerRequest: null — this guarantees it.
 */
export const getQueueConnection = () => {
  if (!REDIS_URL || _validationFailed || _authFailed) return null;
  if (!_queueConnection) {
    _queueConnection = new IORedis(REDIS_URL, { ...FINAL_OPTS });
    attachListeners(_queueConnection, 'queue');
  }
  return _queueConnection;
};

/**
 * Connection object to pass to `new Worker(name, fn, { connection })`.
 * Separate ioredis instance from the queue (BullMQ best-practice).
 */
export const getWorkerConnection = () => {
  if (!REDIS_URL || _validationFailed || _authFailed) return null;
  if (!_workerConnection) {
    _workerConnection = new IORedis(REDIS_URL, { ...FINAL_OPTS });
    attachListeners(_workerConnection, 'worker');
  }
  return _workerConnection;
};

/**
 * Returns true only when Redis has been successfully connected.
 * Queues and workers should check this before trying to use Redis.
 */
export const isRedisAvailable = () => _redisAvailable && !_authFailed && !_validationFailed;

/**
 * Called once during server startup. Validates URL, connects all clients, logs status.
 * Fails fast: if Redis cannot connect the exact reason is logged.
 */
export const initRedis = async () => {
  if (!REDIS_URL) {
    console.warn('[Redis] ⚠️  REDIS_URL not set — all queue features disabled');
    _redisAvailable = false;
    return { connected: false, reason: 'REDIS_URL not set' };
  }

  console.log(`[Redis] URL Loaded: ${REDIS_URL.replace(/\/\/.*@/, '//***@')}`);
  console.log(`[Redis] Upstash detected: ${isUpstash} | TLS forced: ${useTls}`);

  // ── Pre-flight URL validation ──
  const validation = validateRedisUrl(REDIS_URL);
  if (!validation.valid) {
    console.error('\n[Redis] ╔══════════════════════════════════════════════════════╗');
    console.error('[Redis] ║  REDIS AUTHENTICATION FAILED — URL VALIDATION ERRORS  ║');
    console.error('[Redis] ╚══════════════════════════════════════════════════════╝');
    validation.issues.forEach((issue) => console.error(`[Redis]   ⚠️  ${issue}`));
    console.error(`[Redis]   Source  : ${detectConfigSource()}`);
    console.error(`[Redis]   Fix     : Update REDIS_URL with the real Upstash password.`);
    console.error(`[Redis]           : Upstash Console → Redis → gorgeous-katydid-42803 → REST API / Connection String`);
    console.error(`[Redis]   Queues  : DISABLED (will not retry with invalid credentials)\n`);
    _redisAvailable = false;
    _validationFailed = true; // prevent any client creation
    return { connected: false, reason: 'URL validation failed', issues: validation.issues };
  }

  const clients = [
    { client: getRedisClient(), label: 'general' },
    { client: getQueueConnection(), label: 'queue' },
    { client: getWorkerConnection(), label: 'worker' },
  ];

  const results = await Promise.allSettled(
    clients.map(async ({ client, label }) => {
      if (!client) throw new Error('Client is null');
      await client.connect();
      const pong = await client.ping();
      console.log(`[Redis:${label}] PING → ${pong}`);
      return pong;
    })
  );

  const allOk = results.every((r) => r.status === 'fulfilled' && r.value === 'PONG');

  if (allOk) {
    _redisAvailable = true;
    console.log('[Redis] ✅ All Redis connections established successfully');
    console.log('[Redis] ✅ BullMQ Queues: ENABLED');
    console.log('[Redis] ✅ BullMQ Workers: ENABLED');
    return { connected: true };
  }

  // ── Auth failure — show big banner ──
  _redisAvailable = false;

  const authError = results.some((r) =>
    r.status === 'rejected' &&
    String(r.reason?.message || '').toLowerCase().includes('wrongpass')
  );

  if (authError) {
    console.error('\n[Redis] ╔══════════════════════════════════════════════════════╗');
    console.error('[Redis] ║       REDIS AUTHENTICATION FAILED — WRONGPASS        ║');
    console.error('[Redis] ╚══════════════════════════════════════════════════════╝');
    console.error(`[Redis]   Source   : ${detectConfigSource()}`);
    console.error(`[Redis]   Host     : ${validation.parsed?.host}`);
    console.error(`[Redis]   Username : ${validation.parsed?.username}`);
    console.error(`[Redis]   Password : ${validation.parsed?.password ? '*** (present but wrong)' : '(EMPTY)'}`);
    console.error(`[Redis]   ────────────────────────────────────────────────────`);
    console.error(`[Redis]   Action   : Get the correct password from Upstash Console`);
    console.error(`[Redis]            : https://console.upstash.io/redis → gorgeous-katydid-42803`);
    console.error(`[Redis]            : Copy the FULL connection string (with real password)`);
    console.error(`[Redis]            : Paste it into backend/.env as REDIS_URL=redis://...`);
    console.error(`[Redis]   Queues   : DISABLED — will NOT retry with wrong credentials\n`);
  }

  // Log each individual failure
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      const err = r.reason;
      console.error(
        `[Redis:${clients[i].label}] ❌ FAILED to connect:`,
        err?.message || err
      );
    }
  });

  console.error('[Redis] ⚠️  Some Redis connections failed — queue features DISABLED');
  return { connected: false, reason: 'One or more connections failed' };
};

/**
 * Graceful shutdown — call on SIGTERM / SIGINT.
 */
export const shutdownRedis = async () => {
  const clients = [
    { client: _generalClient, label: 'general' },
    { client: _queueConnection, label: 'queue' },
    { client: _workerConnection, label: 'worker' },
  ];

  await Promise.allSettled(
    clients
      .filter(({ client }) => client)
      .map(async ({ client, label }) => {
        try {
          await client.quit();
          console.log(`[Redis:${label}] Disconnected gracefully`);
        } catch (err) {
          console.warn(`[Redis:${label}] Error during disconnect:`, err.message);
        }
      })
  );

  _generalClient = null;
  _queueConnection = null;
  _workerConnection = null;
};
