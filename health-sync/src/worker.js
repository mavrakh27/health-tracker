// health-sync — Cloudflare Worker relay for Health Tracker PWA ↔ PC sync
// R2 storage: exports/{key}/{date}.zip, results/{key}/{date}.json, metadata/{key}/state.json

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ZIP_SIZE = 50 * 1024 * 1024; // 50MB

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);

    // CORS
    if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }), request);

    // GET /health — connection check (no auth required)
    if (parts[0] === 'health' && request.method === 'GET') {
      return cors(json(200, { ok: true, version: '1.0' }));
    }

    // Route: /sync/{key}/...
    if (parts[0] !== 'sync' || parts.length < 2) return cors(json(404, { error: 'not found' }));

    const key = parts[1];
    if (!UUID_RE.test(key)) return cors(json(400, { error: 'invalid key' }));

    const route = parts.slice(2).join('/');

    try {
      const result = await handle(request, env, key, route);
      return cors(result, request);
    } catch (err) {
      console.error(err);
      return cors(json(500, { error: 'internal error' }));
    }
  },
};

async function handle(request, env, key, route) {
  const { method } = request;

  // PUT /sync/{key}/day/{date} — upload day ZIP
  const dayUpload = route.match(/^day\/([\d-]+)$/);
  if (dayUpload && method === 'PUT') {
    const date = dayUpload[1];
    if (!DATE_RE.test(date)) return json(400, { error: 'invalid date' });

    const body = await request.arrayBuffer();
    if (body.byteLength > MAX_ZIP_SIZE) return json(413, { error: 'too large' });

    await env.BUCKET.put(`exports/${key}/${date}.zip`, body);
    await updateState(env, key, state => {
      if (!state.pending) state.pending = [];
      if (!state.pending.includes(date)) state.pending.push(date);
    });
    return json(200, { ok: true, date });
  }

  // GET /sync/{key}/pending — list unprocessed days
  if (route === 'pending' && method === 'GET') {
    const state = await getState(env, key);
    return json(200, { pending: state.pending || [] });
  }

  // GET /sync/{key}/day/{date} — download day ZIP
  if (dayUpload && method === 'GET') {
    const date = dayUpload[1];
    if (!DATE_RE.test(date)) return json(400, { error: 'invalid date' });

    const obj = await env.BUCKET.get(`exports/${key}/${date}.zip`);
    if (!obj) return json(404, { error: 'not found' });

    return new Response(obj.body, {
      headers: { 'Content-Type': 'application/zip', 'Content-Length': obj.size },
    });
  }

  // POST /sync/{key}/day/{date}/done — mark processed + upload results
  const dayDone = route.match(/^day\/([\d-]+)\/done$/);
  if (dayDone && method === 'POST') {
    const date = dayDone[1];
    if (!DATE_RE.test(date)) return json(400, { error: 'invalid date' });

    const body = await request.text();
    if (body) {
      await env.BUCKET.put(`results/${key}/${date}.json`, body);
    }

    await updateState(env, key, state => {
      state.pending = (state.pending || []).filter(d => d !== date);
      if (!state.newResults) state.newResults = [];
      if (!state.newResults.includes(date)) state.newResults.push(date);
    });

    // Keep export ZIP — never delete raw user data
    // ZIPs remain in R2 as permanent archive

    return json(200, { ok: true, date });
  }

  // POST /sync/{key}/results/resync — re-mark all results as new (for reinstall recovery)
  if (route === 'results/resync' && method === 'POST') {
    const listed = await env.BUCKET.list({ prefix: `results/${key}/` });
    const dates = listed.objects.map(o => o.key.replace(`results/${key}/`, '').replace('.json', '')).filter(d => DATE_RE.test(d));
    await updateState(env, key, state => {
      state.newResults = dates;
    });
    return json(200, { ok: true, resyncDates: dates });
  }

  // GET /sync/{key}/results/new — check for new results
  if (route === 'results/new' && method === 'GET') {
    const state = await getState(env, key);
    return json(200, { newResults: state.newResults || [] });
  }

  // GET /sync/{key}/results/{date} — download analysis JSON
  const resultGet = route.match(/^results\/([\d-]+)$/);
  if (resultGet && method === 'GET') {
    const date = resultGet[1];
    if (!DATE_RE.test(date)) return json(400, { error: 'invalid date' });

    const obj = await env.BUCKET.get(`results/${key}/${date}.json`);
    if (!obj) return json(404, { error: 'not found' });

    return new Response(obj.body, {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // POST /sync/{key}/results/{date}/ack — phone acknowledges receipt
  const resultAck = route.match(/^results\/([\d-]+)\/ack$/);
  if (resultAck && method === 'POST') {
    const date = resultAck[1];
    if (!DATE_RE.test(date)) return json(400, { error: 'invalid date' });

    await updateState(env, key, state => {
      state.newResults = (state.newResults || []).filter(d => d !== date);
    });

    // Keep results — never delete user data
    // Results remain in R2 as permanent archive

    return json(200, { ok: true, date });
  }

  return json(404, { error: 'not found' });
}

// --- State helpers ---

async function getState(env, key) {
  const obj = await env.BUCKET.get(`metadata/${key}/state.json`);
  if (!obj) return {};
  return JSON.parse(await obj.text());
}

// updateState uses etag-based optimistic locking to prevent concurrent read-modify-write
// races (e.g. two results arriving simultaneously). Retries up to 3 times on conflict.
async function updateState(env, key, mutator) {
  const MAX_RETRIES = 3;
  const stateKey = `metadata/${key}/state.json`;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // Read current state + capture etag
    const obj = await env.BUCKET.get(stateKey);
    const etag = obj ? obj.etag : null;
    const state = obj ? JSON.parse(await obj.text()) : {};

    // Apply mutation
    mutator(state);

    // Conditional put: only succeeds if etag hasn't changed since our read
    const putOptions = etag
      ? { onlyIf: { etagMatches: etag } }
      : { onlyIf: { etagDoesNotMatch: '*' } };

    try {
      await env.BUCKET.put(stateKey, JSON.stringify(state), putOptions);
      return; // success
    } catch (err) {
      // Only retry on PreconditionFailed (concurrent write); propagate real errors immediately
      const isPrecondition = err?.message?.includes('PreconditionFailed') || err?.status === 412;
      if (isPrecondition && attempt < MAX_RETRIES - 1) continue;
      if (isPrecondition) throw new Error(`updateState: failed after ${MAX_RETRIES} attempts (concurrent writes)`);
      throw err;
    }
  }
}

// --- Response helpers ---

function json(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const ALLOWED_ORIGINS = [
  'https://nemily.github.io',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
];

function cors(response, request) {
  const origin = request?.headers?.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  response.headers.set('Access-Control-Allow-Origin', allowed);
  response.headers.set('Access-Control-Allow-Methods', 'GET, PUT, POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return response;
}
