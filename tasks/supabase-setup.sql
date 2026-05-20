## Analysis & Recommendation

### Approach
Since the Supabase SQL execution via REST API can be unreliable for DDL (Data Definition Language) operations, the safest and most reliable approach is to output the SQL statements directly. This allows Shayan to paste them into the Supabase SQL Editor, which provides immediate feedback and error handling.

### SQL Statements

sql
-- ============================================================
-- ACC v2 Persistence Tables
-- Created for phase-exec feature
-- ============================================================

-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. acc_tasks: Core task tracking table
CREATE TABLE IF NOT EXISTS acc_tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    assigned_agent TEXT,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    provider_used TEXT
);

-- 2. acc_results: Stores execution results for each task
CREATE TABLE IF NOT EXISTS acc_results (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES acc_tasks(id) ON DELETE CASCADE,
    provider_used TEXT,
    is_real_ai_result BOOLEAN DEFAULT FALSE,
    cost_tier TEXT,
    output TEXT,
    summary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. acc_users: User state and preferences
CREATE TABLE IF NOT EXISTS acc_users (
    user_id TEXT PRIMARY KEY,
    name TEXT,
    language TEXT DEFAULT 'en',
    state TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Indexes for performance
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_acc_tasks_status ON acc_tasks(status);
CREATE INDEX IF NOT EXISTS idx_acc_tasks_assigned_agent ON acc_tasks(assigned_agent);
CREATE INDEX IF NOT EXISTS idx_acc_results_task_id ON acc_results(task_id);
CREATE INDEX IF NOT EXISTS idx_acc_users_state ON acc_users(state);

-- ============================================================
-- Optional: Enable Row Level Security (recommended for REDACTED)
-- ============================================================

ALTER TABLE acc_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE acc_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE acc_users ENABLE ROW LEVEL SECURITY;

-- Create policies (adjust as needed)
-- Example: Allow all authenticated users to read/write
-- CREATE POLICY "Allow all" ON acc_tasks FOR ALL USING (true) WITH CHECK (true);
-- CREATE POLICY "Allow all" ON acc_results FOR ALL USING (true) WITH CHECK (true);
-- CREATE POLICY "Allow all" ON acc_users FOR ALL USING (true) WITH CHECK (true);


### Recommendations

1. **Execute in Supabase SQL Editor**: Copy the SQL above and paste into the SQL Editor at supabase.com → SQL Editor. Run each statement block sequentially.

2. **Row Level Security (RLS)**: The SQL includes `ENABLE ROW LEVEL SECURITY` but policies are commented out. For REDACTED, you should create appropriate policies based on your auth model (e.g., using Supabase Auth).

3. **Foreign Key Constraint**: `acc_results.task_id` references `acc_tasks(id)` with `ON DELETE CASCADE`. This means deleting a task will automatically delete its results. If you prefer to keep results for auditing, change to `ON DELETE SET NULL` or remove the constraint.

4. **Indexes**: The indexes on `status`, `assigned_agent`, `task_id`, and `state` will improve query performance for common operations.

5. **Next Steps**: After creating the tables, the next task should be to implement the Node.js script that uses `@supabase/supabase-js` to perform CRUD operations on these tables.

### Why Not Use REST API for DDL?
- The Supabase REST API (`/rest/v1/rpc/exec_sql`) requires the `pg_executesql` function to be installed, which is not available by default.
- Direct SQL execution via the management API is limited to certain operations.
- The SQL Editor provides a safer, more transparent way to create tables with immediate error feedback.