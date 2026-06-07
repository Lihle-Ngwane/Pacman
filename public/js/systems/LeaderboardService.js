
class LeaderboardService {

  get _online() {
    return !!(SUPABASE_URL && SUPABASE_KEY &&
              SUPABASE_URL.length > 10 && SUPABASE_KEY.length > 10);
  }

  // Save a score — upserts by username so same player never duplicates
  async save(name, score, level, mode) {
    const entry = {
      name:  (name || 'AAA').toUpperCase().slice(0, 8),
      score: Math.floor(score),
      level: Math.floor(level),
      mode:  mode || 'normal'
    };

    // Persist username for next session
    saveUsername(entry.name);

    // Always upsert locally
    this._upsertLocal(entry);

    // Try Supabase if configured
    if (this._online) {
      try {
        // Check if this username already has a higher score
        const check = await fetch(
          `${SUPABASE_URL}/rest/v1/scores?name=eq.${encodeURIComponent(entry.name)}&mode=eq.${mode}&order=score.desc&limit=1`,
          { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
        );
        const existing = check.ok ? await check.json() : [];

        if (existing.length > 0 && existing[0].score >= entry.score) {
          // Existing score is better — do not overwrite
          return;
        }

        if (existing.length > 0) {
          // Update existing record
          await fetch(
            `${SUPABASE_URL}/rest/v1/scores?id=eq.${existing[0].id}`,
            {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
              },
              body: JSON.stringify({ score: entry.score, level: entry.level })
            }
          );
        } else {
          // New username — insert
          await fetch(`${SUPABASE_URL}/rest/v1/scores`, {
            method: 'POST',
            headers: {
              'Content-Type':  'application/json',
              'apikey':         SUPABASE_KEY,
              'Authorization': `Bearer ${SUPABASE_KEY}`,
              'Prefer':        'return=minimal'
            },
            body: JSON.stringify(entry)
          });
        }
      } catch(e) {
        console.warn('Supabase upsert failed:', e.message);
      }
    }
  }

  // Get top 10 — tries Supabase first, falls back to localStorage
  async getTop(limit = 10) {
    if (this._online) {
      try {
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/scores?order=score.desc&limit=${limit}`,
          {
            headers: {
              'apikey':         SUPABASE_KEY,
              'Authorization': `Bearer ${SUPABASE_KEY}`
            }
          }
        );
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) return data;
        }
      } catch (e) {
        console.warn('Supabase fetch failed, using local:', e.message);
      }
    }
    return this._getLocal(limit);
  }

  get isOnline() { return this._online; }

  // ---- LOCAL STORAGE HELPERS ----

  _upsertLocal(entry) {
    try {
      const existing = this._getLocal(50);
      // Find same username + mode combination
      const idx = existing.findIndex(e =>
        e.name === entry.name && e.mode === entry.mode
      );
      if (idx >= 0) {
        // Only update if new score is higher
        if (entry.score > existing[idx].score) {
          existing[idx] = { ...entry, created_at: new Date().toLocaleDateString('en-ZA') };
        }
      } else {
        existing.push({ ...entry, created_at: new Date().toLocaleDateString('en-ZA') });
      }
      existing.sort((a, b) => b.score - a.score);
      localStorage.setItem(LB_KEY, JSON.stringify(existing.slice(0, 50)));
    } catch(e) {}
  }

  _getLocal(limit) {
    try {
      const data = JSON.parse(localStorage.getItem(LB_KEY) || '[]');
      return data.slice(0, limit);
    } catch(e) { return []; }
  }

  clearLocal() {
    try { localStorage.removeItem(LB_KEY); } catch(e) {}
  }
}

// Global singleton
const leaderboardService = new LeaderboardService();

// ============================================================
// USERNAME MANAGEMENT
// Saves username to localStorage so it persists across sessions.
// On leaderboard save, if the same username already has a score
// for this mode, only update if the new score is higher.
// ============================================================

const USERNAME_KEY = 'pacman_username';

function getSavedUsername() {
  try { return localStorage.getItem(USERNAME_KEY) || null; }
  catch(e) { return null; }
}

function saveUsername(name) {
  try { localStorage.setItem(USERNAME_KEY, name.toUpperCase().slice(0, 8)); }
  catch(e) {}
}
