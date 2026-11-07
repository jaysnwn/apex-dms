-- =============================================================================
-- Short links for documents shared on WhatsApp: https://<app>/d/<code>
-- The app looks the code up (server side, service role) and redirects to a
-- fresh, short-lived signed URL of the private PDF. No client can read this
-- table directly (RLS on, no policies).
-- =============================================================================
create table public.share_links (
  code        text primary key check (code ~ '^[A-Za-z0-9]{6,16}$'),
  path        text not null,
  filename    text not null,
  expires_at  timestamptz not null,
  created_by  uuid references public.profiles (id),
  created_at  timestamptz not null default now()
);
create index share_links_path_idx on public.share_links (path);
alter table public.share_links enable row level security;
revoke all on public.share_links from anon, authenticated;
