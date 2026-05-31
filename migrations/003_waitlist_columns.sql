-- Migration 003: Add qualification columns to acc_waitlist

ALTER TABLE acc_waitlist ADD COLUMN IF NOT EXISTS automate TEXT;
ALTER TABLE acc_waitlist ADD COLUMN IF NOT EXISTS role     TEXT;
ALTER TABLE acc_waitlist ADD COLUMN IF NOT EXISTS control  TEXT;
