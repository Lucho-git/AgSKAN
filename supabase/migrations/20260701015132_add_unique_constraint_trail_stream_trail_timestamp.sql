-- add_unique_constraint_trail_stream_trail_timestamp
-- Applied through the Supabase MCP; text copied from the recorded migration.

-- Add unique constraint on (trail_id, timestamp) so ON CONFLICT clauses work.
-- This prevents duplicate GPS points for the same trail at the same timestamp.
-- The existing non-unique indexes (idx_trail_stream_trail_timestamp, 
-- idx_trail_stream_trail_id_timestamp) are redundant once this constraint exists
-- (a unique constraint creates its own index), but we leave them for now to
-- avoid locking the table during DROP INDEX on a 2.9M row table.

-- First, remove any existing duplicates (keep the first one of each pair)
DELETE FROM trail_stream
WHERE id IN (
    SELECT id FROM (
        SELECT id, 
               ROW_NUMBER() OVER (PARTITION BY trail_id, timestamp ORDER BY id) AS rn
        FROM trail_stream
    ) t WHERE rn > 1
);

-- Add the unique constraint
ALTER TABLE trail_stream 
ADD CONSTRAINT trail_stream_trail_id_timestamp_key 
UNIQUE (trail_id, timestamp);
