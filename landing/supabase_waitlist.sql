-- Run this in your Supabase SQL editor to create the waitlist table
CREATE TABLE IF NOT EXISTS acc_waitlist (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email      text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS (backend only — no public reads)
ALTER TABLE acc_waitlist ENABLE ROW LEVEL SECURITY;

-- Allow the backend service role to insert
CREATE POLICY "service insert" ON acc_waitlist
  FOR INSERT WITH CHECK (true);

-- Block all public reads (waitlist is private)
CREATE POLICY "no public read" ON acc_waitlist
  FOR SELECT USING (false);
