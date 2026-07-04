# ScanFlow Demo — Deploy Instructions

## What this is
Two-page demo for restaurant visits. Works in two modes:
- **Same device/browser** (BroadcastChannel) — open both tabs on one phone, no setup needed
- **Cross-device** (Supabase Realtime) — customer orders on their phone, appears on yours instantly

---

## Quick deploy to scanflow.in

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "ScanFlow demo"
git remote add origin https://github.com/YOUR_USERNAME/scanflow-demo.git
git push -u origin main
```

### 2. Connect to Vercel
- Go to vercel.com → New Project → Import your repo
- Deploy (no env vars needed for demo mode)
- Add `scanflow.in` as a custom domain in Vercel settings

### 3. (Optional) Add Supabase for cross-device real-time
Create a free project at supabase.com, then run this SQL:

```sql
create table orders (
  id            uuid default gen_random_uuid() primary key,
  restaurant_slug text,
  restaurant_name text,
  table_number  int,
  items         jsonb,
  total         int,
  notes         text,
  status        text default 'new',
  created_at    timestamptz default now()
);

-- Enable realtime
alter publication supabase_realtime add table orders;
```

Then paste your Supabase URL and anon key into the CONFIG block at the top of both `menu.html` and `staff.html`.

---

## URLs after deploy
| Page | URL |
|---|---|
| Customer menu | `scanflow.in/demo/menu` |
| Staff dashboard | `scanflow.in/demo/staff` |

---

## How to use in a restaurant visit

1. Open `scanflow.in/demo/staff` on **your phone**
2. Show the owner the staff dashboard
3. Hand them your phone (or a second device) — open `scanflow.in/demo/menu`
4. Let them add items and place an order
5. Watch it appear on the staff dashboard in real time
6. Say: "This is what your staff would see, on any phone, no app needed."

## Customise for each visit
In `menu.html`, change the `DEMO_CONFIG` block:
```js
const DEMO_CONFIG = {
  restaurantName: 'Brahmaputra Kitchen',  // ← their name
  tableNumber: 4,
  slug: 'scanflow-demo'
};
```
Then redeploy (takes ~30 seconds on Vercel).
