-- ── 006_variations.sql ────────────────────────────────────────────────────────
-- Variations tracking: baseline snapshots + audit log of changes after lock.
-- Phase 1 — DB only. No UI changes.

-- ── 1. Extend projects table ───────────────────────────────────────────────────

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS baseline_locked_at  timestamptz,
  ADD COLUMN IF NOT EXISTS baseline_locked_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- ── 2. task_baselines ─────────────────────────────────────────────────────────
-- One snapshot per task, captured at the moment the baseline is locked.
-- UNIQUE on task_id: only one baseline per task (idempotent lock).

CREATE TABLE IF NOT EXISTS task_baselines (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id                uuid        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  project_id             uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  original_start_date    date        NOT NULL,
  original_end_date      date        NOT NULL,
  original_duration      integer     NOT NULL,
  original_contract_price numeric(12,2) NOT NULL DEFAULT 0,
  locked_at              timestamptz NOT NULL DEFAULT now(),
  locked_by              uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id)
);

-- ── 3. task_variations ────────────────────────────────────────────────────────
-- Append-only audit log. Written by trigger only; no direct DML from app.

CREATE TABLE IF NOT EXISTS task_variations (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id      uuid        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  project_id   uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  field_changed text        NOT NULL,
  old_value    text,
  new_value    text,
  changed_at   timestamptz NOT NULL DEFAULT now(),
  changed_by   uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  reason       text,
  CONSTRAINT task_variations_field_check
    CHECK (field_changed IN ('start_date', 'end_date', 'duration', 'contract_price'))
);

CREATE INDEX IF NOT EXISTS task_variations_task_id_idx    ON task_variations (task_id);
CREATE INDEX IF NOT EXISTS task_variations_project_id_idx ON task_variations (project_id);
CREATE INDEX IF NOT EXISTS task_variations_changed_at_idx ON task_variations (changed_at);

-- ── 4. AFTER UPDATE trigger on tasks ─────────────────────────────────────────
-- Fires only when the project baseline is locked AND the task has a baseline row.
-- Skips tasks added after the baseline was taken (no baseline row → silent skip).

CREATE OR REPLACE FUNCTION record_task_variations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_baseline task_baselines%ROWTYPE;
  v_locked_at timestamptz;
BEGIN
  -- Check whether this project has a locked baseline
  SELECT baseline_locked_at
    INTO v_locked_at
    FROM projects
   WHERE id = NEW.project_id;

  IF v_locked_at IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check whether this task has a baseline snapshot
  SELECT * INTO v_baseline
    FROM task_baselines
   WHERE task_id = NEW.id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- current_start → 'start_date'
  IF NEW.current_start IS DISTINCT FROM OLD.current_start THEN
    INSERT INTO task_variations
      (task_id, project_id, field_changed, old_value, new_value, changed_by)
    VALUES
      (NEW.id, NEW.project_id, 'start_date',
       OLD.current_start::text,
       NEW.current_start::text,
       auth.uid());
  END IF;

  -- current_end → 'end_date'
  IF NEW.current_end IS DISTINCT FROM OLD.current_end THEN
    INSERT INTO task_variations
      (task_id, project_id, field_changed, old_value, new_value, changed_by)
    VALUES
      (NEW.id, NEW.project_id, 'end_date',
       OLD.current_end::text,
       NEW.current_end::text,
       auth.uid());
  END IF;

  -- duration_days → 'duration'
  IF NEW.duration_days IS DISTINCT FROM OLD.duration_days THEN
    INSERT INTO task_variations
      (task_id, project_id, field_changed, old_value, new_value, changed_by)
    VALUES
      (NEW.id, NEW.project_id, 'duration',
       OLD.duration_days::text,
       NEW.duration_days::text,
       auth.uid());
  END IF;

  -- contract_value → 'contract_price'
  IF NEW.contract_value IS DISTINCT FROM OLD.contract_value THEN
    INSERT INTO task_variations
      (task_id, project_id, field_changed, old_value, new_value, changed_by)
    VALUES
      (NEW.id, NEW.project_id, 'contract_price',
       OLD.contract_value::text,
       NEW.contract_value::text,
       auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_record_task_variations ON tasks;
CREATE TRIGGER trg_record_task_variations
  AFTER UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION record_task_variations();

-- ── 5. RPC: lock_project_baseline ────────────────────────────────────────────
-- Idempotent: calling it twice is safe (UNIQUE on task_id → ON CONFLICT DO NOTHING).
-- Snapshots current_start, current_end, duration_days, contract_value for every task.

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

  -- Snapshot every task (skip tasks already snapshotted)
  INSERT INTO task_baselines
    (task_id, project_id,
     original_start_date, original_end_date,
     original_duration, original_contract_price,
     locked_at, locked_by)
  SELECT
    t.id,
    t.project_id,
    t.current_start,
    t.current_end,
    t.duration_days,
    COALESCE(t.contract_value, 0),
    v_now,
    v_uid
  FROM tasks t
  WHERE t.project_id = p_project_id
    AND t.current_start IS NOT NULL
    AND t.current_end   IS NOT NULL
  ON CONFLICT (task_id) DO NOTHING;
END;
$$;

-- ── 6. RLS policies ───────────────────────────────────────────────────────────

ALTER TABLE task_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_variations ENABLE ROW LEVEL SECURITY;

-- task_baselines: org members may SELECT; no direct INSERT/UPDATE/DELETE
CREATE POLICY "task_baselines_select"
  ON task_baselines FOR SELECT
  TO authenticated
  USING (
    project_id IN (
      SELECT id FROM projects
       WHERE organisation_id IN (
         SELECT organisation_id FROM users WHERE id = auth.uid()
       )
    )
  );

-- task_variations: org members may SELECT; no direct INSERT/UPDATE/DELETE
CREATE POLICY "task_variations_select"
  ON task_variations FOR SELECT
  TO authenticated
  USING (
    project_id IN (
      SELECT id FROM projects
       WHERE organisation_id IN (
         SELECT organisation_id FROM users WHERE id = auth.uid()
       )
    )
  );

-- ── 7. GRANTs ─────────────────────────────────────────────────────────────────

GRANT SELECT ON task_baselines  TO authenticated;
GRANT SELECT ON task_variations TO authenticated;
GRANT EXECUTE ON FUNCTION lock_project_baseline(uuid) TO authenticated;
