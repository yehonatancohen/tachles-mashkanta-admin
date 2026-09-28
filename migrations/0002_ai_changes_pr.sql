-- The agent now implements its top proposal as a PR on mortgage-website. A change's effect is
-- measured from when it actually shipped (PR merged + deployed), not from when it was proposed —
-- an unreviewed PR can sit for days, and measuring from created_at would blur the before/after.
ALTER TABLE ai_changes ADD COLUMN pr_url TEXT;
ALTER TABLE ai_changes ADD COLUMN shipped_at TEXT;
