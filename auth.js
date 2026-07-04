/*
  ScanFlow — shared auth config & helpers
  ----------------------------------------
  Used by login.html, admin.html, owner.html and waiter.html.

  SETUP (do this once):
  1. Create a free project at https://supabase.com
  2. Run supabase-setup.sql in the Supabase SQL editor (creates the `profiles`
     table, roles, and row-level security policies).
  3. Copy your Project URL and anon/public key from
     Supabase Dashboard → Settings → API, and paste them below.
  4. Create your own master admin login manually in
     Supabase Dashboard → Authentication → Users → Add user, then run:
       update profiles set role = 'admin' where id = '<that user's UUID>';
     Do NOT create the admin account through a public sign-up form —
     there should only ever be one, and you create it by hand.

  This file only ever uses the anon/public key, which is safe to ship in
  browser code. Never put your Supabase service_role key in any .html/.js
  file the browser loads — that key can bypass row-level security.
*/

const SCANFLOW_SUPABASE_URL = 'https://vlnukvqyfpwudewhulth.supabase.co';
const SCANFLOW_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZsbnVrdnF5ZnB3dWRld2h1bHRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwOTk4MjMsImV4cCI6MjA5ODY3NTgyM30.Sp2sK6LF_zsAJSUiS3P2cbYCK7TXmTPAH-ZJhdLV-GQ';

const scanflowConfigured =
  !SCANFLOW_SUPABASE_URL.startsWith('YOUR_') &&
  !SCANFLOW_SUPABASE_ANON_KEY.startsWith('YOUR_');

const SCANFLOW_ROLE_HOME = { admin: 'admin.html', owner: 'owner.html', waiter: 'waiter.html' };

let _scanflowClient = null;
function getScanflowClient() {
  if (!scanflowConfigured) return null;
  if (!_scanflowClient) {
    _scanflowClient = supabase.createClient(SCANFLOW_SUPABASE_URL, SCANFLOW_SUPABASE_ANON_KEY);
  }
  return _scanflowClient;
}

// Returns { id, email, role, full_name, restaurant_id } or null if signed out.
async function scanflowGetProfile() {
  const client = getScanflowClient();
  if (!client) return null;
  const { data: { session } } = await client.auth.getSession();
  if (!session) return null;
  const { data: profile, error } = await client
    .from('profiles')
    .select('role, full_name, restaurant_id')
    .eq('id', session.user.id)
    .single();
  if (error) {
    // Left visible on purpose — open the browser console (F12) to see the
    // exact reason the profile row couldn't be read (RLS, missing row, etc).
    console.error('ScanFlow: could not read profile for', session.user.id, error);
    return null;
  }
  if (!profile) return null;
  return { id: session.user.id, email: session.user.email, ...profile };
}

// Call at the top of a dashboard page. Redirects to login if signed out,
// or to the correct dashboard if signed in with a different role.
async function scanflowRequireRole(expectedRole) {
  if (!scanflowConfigured) {
    scanflowShowNotConfigured();
    return null;
  }
  const profile = await scanflowGetProfile();
  if (!profile) {
    window.location.href = 'login.html';
    return null;
  }
  if (profile.role !== expectedRole) {
    window.location.href = SCANFLOW_ROLE_HOME[profile.role] || 'login.html';
    return null;
  }
  return profile;
}

async function scanflowSignOut() {
  const client = getScanflowClient();
  if (client) await client.auth.signOut();
  window.location.href = 'login.html';
}

function scanflowShowNotConfigured() {
  document.body.innerHTML =
    '<div style="font-family:Inter,system-ui,sans-serif;max-width:480px;margin:80px auto;padding:32px;' +
    'background:#fff;border:1px solid #E2E9F2;border-radius:16px;color:#0D2539;line-height:1.6;">' +
    '<h1 style="font-size:20px;margin-bottom:12px;">Supabase isn’t connected yet</h1>' +
    '<p style="font-size:14px;color:#46586B;">This page needs a Supabase project before it will work. ' +
    'Open <code>auth.js</code> and follow the setup steps at the top of the file.</p>' +
    '<p style="margin-top:16px;"><a href="index.html" style="color:#1783F2;font-weight:600;">← Back to homepage</a></p>' +
    '</div>';
}
