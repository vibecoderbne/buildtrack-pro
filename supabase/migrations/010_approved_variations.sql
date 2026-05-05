-- ── 010_approved_variations.sql ──────────────────────────────────────────────
-- Three-layer schedule model:
--   1. task_baselines        — immutable snapshot at contract lock
--   2. task_approved_schedule — changes only via approved variations
--   3. tasks (current)        — free Gantt edits; does not affect variance
--
-- Also adds approved_variations + approved_variation_changes tables and
-- updates the lock RPC to seed task_approved_schedule alongside task_baselines.

-- ── 1. task_approved_schedule ─────────────────────────────────────────────────
-- One row per task per locked project. Approved = baseline at lock time;
-- updated when an approved variation modifies dates or contract value.

CREATE TABLE IF NOT EXISTS task_approved_schedule (
  id                      uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id              uuid          NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id                 uuid          NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  approved_start_date     date          NOT NULL,
  approved_end_date       date          NOT NULL,
  approved_contract_value numeric(12,2) NULL,
  last_updated_at         timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (project_id, task_id)
);

-- ── 2. approved_variations ────────────────────────────────────────────────────
-- One row per manually entered approved contract variation.

CREATE TABLE IF NOT EXISTS approved_variations (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  variation_number int         NOT NULL,
  title            text        NOT NULL,
  description      text        NULL,
  approved_at      date        NOT NULL,
  approved_by      uuid        NULL REFERENCES auth.users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, variation_number)
);

-- ── 3. approved_variation_changes ─────────────────────────────────────────────
-- Line items within a variation. Each row records one change to one task.

CREATE TABLE IF NOT EXISTS approved_variation_changes (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  variation_id        uuid          NOT NULL REFERENCES approved_variations(id) ON DELETE CASCADE,
  change_type         text          NOT NULL
    CHECK (change_type IN ('add_task', 'modify_task', 'change_value')),
  task_id             uuid          NULL REFERENCES tasks(id) ON DELETE CASCADE,

  -- Modify task dates
  prev_start_date     date          NULL,
  new_start_date      date          NULL,
  prev_end_date       date          NULL,
  new_end_date        date          NULL,

  -- Change contract value
  prev_contract_value numeric(12,2) NULL,
  new_contract_value  numeric(12,2) NULL,

  -- Add task snapshot
  new_task_name       text          NULL,
  new_task_trade      text          NULL
);

-- ── 4. Seed task_approved_schedule for already-locked projects ────────────────
-- Ensures existing locked projects start with approved == baseline (variance = 0d).

INSERT INTO task_approved_schedule
  (project_id, task_id, approved_start_date, approved_end_date, approved_contract_value)
SELECT
  tb.project_id,
  tb.task_id,
  tb.original_start_date,
  tb.original_end_date,
  tb.original_contract_price
FROM task_baselines tb
JOIN projects p ON p.id = tb.project_id
WHERE p.baseline_locked_at IS NOT NULL
ON CONFLICT (project_id, task_id) DO NOTHING;

-- ── 5. Update lock RPC to also seed task_approved_schedule ────────────────────

CREATE OR REPLACE FUNCTION lock_project_baseline(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_uid uuid        := auth.uid();
BEGIN
  -- Stamp the lock on the project (idempotent: only set if not already locked)
  UPDATE projects
     SET baseline_locked_at = COALESCE(baseline_locked_at, v_now),
         baseline_locked_by = COALESCE(baseline_locked_by, v_uid)
   WHERE id = p_project_id;

  -- Snapshot every task into task_baselines (skip already snapshotted)
  INSERT INTO task_baselines
    (task_id, project_id,
     original_start_date, original_end_date,
     original_duration, original_contract_price,
     locked_at, locked_by)
  SELECT
    t.id, t.project_id,
    t.current_start, t.current_end,
    t.duration_days, COALESCE(t.contract_value, 0),
    v_now, v_uid
  FROM tasks t
  WHERE t.project_id = p_project_id
    AND t.current_start IS NOT NULL
    AND t.current_end   IS NOT NULL
  ON CONFLICT (task_id) DO NOTHING;

  -- Seed task_approved_schedule (approved = baseline at lock time)
  INSERT INTO task_approved_schedule
    (project_id, task_id, approved_start_date, approved_end_date, approved_contract_value, last_updated_at)
  SELECT
    t.project_id, t.id,
    t.current_start, t.current_end,
    t.contract_value,
    v_now
  FROM tasks t
  WHERE t.project_id = p_project_id
    AND t.current_start IS NOT NULL
    AND t.current_end   IS NOT NULL
  ON CONFLICT (project_id, task_id) DO NOTHING;
END;
$$;

-- ── 6. RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE task_approved_schedule    ENABLE ROW LEVEL SECURITY;
ALTER TABLE approved_variations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE approved_variation_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_approved_schedule_select"
  ON task_approved_schedule FOR SELECT TO authenticated
  USING (project_id IN (
    SELECT id FROM projects WHERE organisation_id IN (
      SELECT organisation_id FROM users WHERE id = auth.uid()
    )
  ));

CREATE POLICY "task_approved_schedule_insert"
  ON task_approved_schedule FOR INSERT TO authenticated
  WITH CHECK (project_id IN (
    SELECT id FROM projects WHERE organisation_id IN (
      SELECT organisation_id FROM users WHERE id = auth.uid()
    )
  ));

CREATE POLICY "task_approved_schedule_update"
  ON task_approved_schedule FOR UPDATE TO authenticated
  USING (project_id IN (
    SELECT id FROM projects WHERE organisation_id IN (
      SELECT organisation_id FROM users WHERE id = auth.uid()
    )
  ));

CREATE POLICY "approved_variations_select"
  ON approved_variations FOR SELECT TO authenticated
  USING (project_id IN (
    SELECT id FROM projects WHERE organisation_id IN (
      SELECT organisation_id FROM users WHERE id = auth.uid()
    )
  ));

CREATE POLICY "approved_variations_insert"
  ON approved_variations FOR INSERT TO authenticated
  WITH CHECK (project_id IN (
    SELECT id FROM projects WHERE organisation_id IN (
      SELECT organisation_id FROM users WHERE id = auth.uid()
    )
  ));

CREATE POLICY "approved_variation_changes_select"
  ON approved_variation_changes FOR SELECT TO authenticated
  USING (variation_id IN (
    SELECT id FROM approved_variations WHERE project_id IN (
      SELECT id FROM projects WHERE organisation_id IN (
        SELECT organisation_id FROM users WHERE id = auth.uid()
      )
    )
  ));

CREATE POLICY "approved_variation_changes_insert"
  ON approved_variation_changes FOR INSERT TO authenticated
  WITH CHECK (variation_id IN (
    SELECT id FROM approved_variations WHERE project_id IN (
      SELECT id FROM projects WHERE organisation_id IN (
        SELECT organisation_id FROM users WHERE id = auth.uid()
      )
    )
  ));

-- ── 7. GRANTs ─────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE ON task_approved_schedule     TO authenticated;
GRANT SELECT, INSERT          ON approved_variations        TO authenticated;
GRANT SELECT, INSERT          ON approved_variation_changes TO authenticated;
