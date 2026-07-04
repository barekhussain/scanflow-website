// ScanFlow — /api/create-user
// Runs on Vercel's server, never in the browser. This is the ONLY place
// the Supabase service_role key is used — it must live in a Vercel
// Environment Variable, never in any file the browser loads.
//
// SETUP (Vercel dashboard → your project → Settings → Environment Variables):
//   SUPABASE_URL                = same URL that's in auth.js
//   SUPABASE_SERVICE_ROLE_KEY   = Supabase → Settings → API → service_role
//                                 (the SECRET one, not the anon/public one)
// After adding both, redeploy so the function picks them up.

module.exports = async function handler(req, res) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Unauthenticated health check — reveals only a boolean, no secrets.
  // Lets the dashboard's Settings page show whether this function is wired up.
  if (req.method === 'GET') {
    res.status(200).json({ configured: !!(SUPABASE_URL && SERVICE_ROLE_KEY) });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    res.status(500).json({
      error: 'Server is not configured yet. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel → Settings → Environment Variables, then redeploy.'
    });
    return;
  }

  // 1. Who is calling this? Verify their session token with Supabase.
  const authHeader = req.headers.authorization || '';
  const callerToken = authHeader.replace(/^Bearer\s+/i, '');
  if (!callerToken) {
    res.status(401).json({ error: 'Missing session token.' });
    return;
  }

  try {
    const whoRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${callerToken}` }
    });
    if (!whoRes.ok) {
      res.status(401).json({ error: 'Your session is invalid or expired — sign in again.' });
      return;
    }
    const callerUser = await whoRes.json();

    // 2. Is the caller actually an admin? Never trust the client for this —
    //    check the database directly, server-side, every time.
    const profRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${callerUser.id}&select=role`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
    );
    if (!profRes.ok) {
      // A failed lookup is NOT the same as "not an admin" — surface the
      // real reason (commonly a missing GRANT on the profiles table)
      // instead of hiding it behind a misleading 403.
      const errBody = await profRes.text();
      console.error('ScanFlow create-user: profile lookup failed', profRes.status, errBody);
      res.status(500).json({ error: `Could not verify admin status (profile lookup failed: ${errBody}). This is usually a missing database GRANT, not a permissions problem with your account.` });
      return;
    }
    const profData = await profRes.json();
    if (!Array.isArray(profData) || !profData.length || profData[0].role !== 'admin') {
      res.status(403).json({ error: 'Only an admin account can create logins.' });
      return;
    }

    // 3. Validate the new-user input.
    const { email, password, role, restaurant_id, full_name } = req.body || {};
    if (!email || !password || !['owner', 'waiter'].includes(role)) {
      res.status(400).json({ error: 'email, password, and a role of owner or waiter are required.' });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters.' });
      return;
    }
    if ((role === 'owner' || role === 'waiter') && !restaurant_id) {
      res.status(400).json({ error: 'Pick which restaurant this login belongs to.' });
      return;
    }

    // 4. Create the Supabase Auth user (admin API — service_role only).
    const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: full_name ? { full_name } : undefined
      })
    });
    const createData = await createRes.json();
    if (!createRes.ok) {
      const reason = createData.msg || createData.error_description || createData.message || 'Could not create the login.';
      res.status(400).json({ error: reason });
      return;
    }
    const newUserId = createData.id;

    // 5. The signup trigger already created a default profile row
    //    (role='waiter', no restaurant). Set it to what was actually asked for.
    const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${newUserId}`, {
      method: 'PATCH',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify({ role, restaurant_id, full_name: full_name || null })
    });
    if (!updateRes.ok) {
      res.status(207).json({
        warning: true,
        id: newUserId,
        email,
        error: `Login was created but assigning the role failed. Use "Link an existing login" with this UID: ${newUserId}`
      });
      return;
    }

    res.status(200).json({ id: newUserId, email });
  } catch (err) {
    res.status(500).json({ error: 'Unexpected server error: ' + err.message });
  }
};
