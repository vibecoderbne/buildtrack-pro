-- Add setup_completed flag to projects.
-- New projects default to false (template picker flow).
-- All existing projects are backfilled to true so their flow is unchanged.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS setup_completed boolean NOT NULL DEFAULT false;

UPDATE projects SET setup_completed = true;
