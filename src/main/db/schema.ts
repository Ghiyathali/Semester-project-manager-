/**
 * Forward-only schema migrations.
 *
 * Kept as inline SQL rather than loose `.sql` files so the bundled main process
 * never has to locate assets on disk. Add a new entry to migrate; never edit an
 * existing one.
 */

export interface Migration {
  version: number
  name: string
  sql: string
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial schema',
    sql: `
CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE project (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  name                  TEXT    NOT NULL,
  course                TEXT    NOT NULL DEFAULT '',
  description           TEXT    NOT NULL DEFAULT '',
  start_date            TEXT    NOT NULL,
  deadline_date         TEXT    NOT NULL,
  timezone              TEXT    NOT NULL DEFAULT 'UTC',
  sprint_length_days    INTEGER NOT NULL DEFAULT 14,
  week_starts_on        INTEGER NOT NULL DEFAULT 1,
  align_sprints_to_week INTEGER NOT NULL DEFAULT 1,
  include_daily_standup INTEGER NOT NULL DEFAULT 0,
  phase_ratios          TEXT    NOT NULL,
  ects_credits          REAL,
  created_at            TEXT    NOT NULL,
  updated_at            TEXT    NOT NULL,
  planned_at            TEXT
);

-- The student's repeating weekly working pattern.
CREATE TABLE availability_rule (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  weekday    INTEGER NOT NULL,
  start_time TEXT    NOT NULL,
  end_time   TEXT    NOT NULL
);
CREATE INDEX idx_availability_project ON availability_rule(project_id);

-- One-off deviations: exams, holidays, or a bonus all-day session.
CREATE TABLE exception_day (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  date       TEXT    NOT NULL,
  kind       TEXT    NOT NULL CHECK (kind IN ('blackout', 'extra')),
  start_time TEXT,
  end_time   TEXT,
  reason     TEXT    NOT NULL DEFAULT ''
);
CREATE INDEX idx_exception_project_date ON exception_day(project_id, date);

CREATE TABLE deadline (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  title      TEXT    NOT NULL,
  date       TEXT    NOT NULL,
  kind       TEXT    NOT NULL DEFAULT 'custom',
  is_hard    INTEGER NOT NULL DEFAULT 1,
  notes      TEXT    NOT NULL DEFAULT ''
);
CREATE INDEX idx_deadline_project_date ON deadline(project_id, date);

CREATE TABLE phase (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id       INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  kind             TEXT    NOT NULL,
  merged_from      TEXT    NOT NULL DEFAULT '[]',
  position         INTEGER NOT NULL,
  start_date       TEXT    NOT NULL,
  end_date         TEXT    NOT NULL,
  goal             TEXT    NOT NULL DEFAULT '',
  status           TEXT    NOT NULL DEFAULT 'planned',
  is_generated     INTEGER NOT NULL DEFAULT 1,
  is_user_modified INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_phase_project ON phase(project_id, position);

CREATE TABLE sprint (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id         INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  phase_id           INTEGER REFERENCES phase(id) ON DELETE SET NULL,
  position           INTEGER NOT NULL,
  name               TEXT    NOT NULL,
  start_date         TEXT    NOT NULL,
  end_date           TEXT    NOT NULL,
  goal               TEXT    NOT NULL DEFAULT '',
  capacity_hours     REAL    NOT NULL DEFAULT 0,
  ceremony_hours     REAL    NOT NULL DEFAULT 0,
  net_capacity_hours REAL    NOT NULL DEFAULT 0,
  working_days       INTEGER NOT NULL DEFAULT 0,
  status             TEXT    NOT NULL DEFAULT 'planned',
  is_generated       INTEGER NOT NULL DEFAULT 1,
  is_user_modified   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_sprint_project ON sprint(project_id, position);

CREATE TABLE ceremony (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id       INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  sprint_id        INTEGER REFERENCES sprint(id) ON DELETE CASCADE,
  kind             TEXT    NOT NULL,
  title            TEXT    NOT NULL,
  date             TEXT    NOT NULL,
  start_time       TEXT    NOT NULL,
  end_time         TEXT    NOT NULL,
  minutes          INTEGER NOT NULL,
  notes            TEXT    NOT NULL DEFAULT '',
  done             INTEGER NOT NULL DEFAULT 0,
  is_generated     INTEGER NOT NULL DEFAULT 1,
  is_user_modified INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_ceremony_project_date ON ceremony(project_id, date);

CREATE TABLE milestone (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id       INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  phase_id         INTEGER REFERENCES phase(id) ON DELETE SET NULL,
  phase_kind       TEXT    NOT NULL DEFAULT '',
  kind             TEXT    NOT NULL,
  name             TEXT    NOT NULL,
  date             TEXT    NOT NULL,
  description      TEXT    NOT NULL DEFAULT '',
  status           TEXT    NOT NULL DEFAULT 'pending',
  is_generated     INTEGER NOT NULL DEFAULT 1,
  is_user_modified INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_milestone_project_date ON milestone(project_id, date);

CREATE TABLE artifact (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id       INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  phase_id         INTEGER REFERENCES phase(id) ON DELETE SET NULL,
  phase_kind       TEXT    NOT NULL DEFAULT '',
  name             TEXT    NOT NULL,
  discipline       TEXT    NOT NULL,
  due_date         TEXT    NOT NULL,
  description      TEXT    NOT NULL DEFAULT '',
  status           TEXT    NOT NULL DEFAULT 'not_started',
  is_optional      INTEGER NOT NULL DEFAULT 0,
  link             TEXT    NOT NULL DEFAULT '',
  is_generated     INTEGER NOT NULL DEFAULT 1,
  is_user_modified INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_artifact_project_due ON artifact(project_id, due_date);

CREATE TABLE backlog_item (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id          INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  sprint_id           INTEGER REFERENCES sprint(id) ON DELETE SET NULL,
  title               TEXT    NOT NULL,
  description         TEXT    NOT NULL DEFAULT '',
  acceptance_criteria TEXT    NOT NULL DEFAULT '',
  type                TEXT    NOT NULL DEFAULT 'story',
  discipline          TEXT    NOT NULL DEFAULT 'implementation',
  points              REAL    NOT NULL DEFAULT 0,
  estimate_hours      REAL    NOT NULL DEFAULT 0,
  priority            INTEGER NOT NULL DEFAULT 100,
  status              TEXT    NOT NULL DEFAULT 'backlog',
  created_at          TEXT    NOT NULL,
  updated_at          TEXT    NOT NULL,
  done_at             TEXT,
  is_generated        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_item_project_status ON backlog_item(project_id, status);
CREATE INDEX idx_item_sprint ON backlog_item(sprint_id);

-- Status transitions, so a burndown can be reconstructed for any past day.
CREATE TABLE item_event (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id     INTEGER NOT NULL REFERENCES backlog_item(id) ON DELETE CASCADE,
  project_id  INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status   TEXT    NOT NULL,
  points      REAL    NOT NULL DEFAULT 0,
  at          TEXT    NOT NULL
);
CREATE INDEX idx_event_project_at ON item_event(project_id, at);

CREATE TABLE work_session (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  item_id    INTEGER REFERENCES backlog_item(id) ON DELETE SET NULL,
  sprint_id  INTEGER REFERENCES sprint(id) ON DELETE SET NULL,
  date       TEXT    NOT NULL,
  hours      REAL    NOT NULL,
  note       TEXT    NOT NULL DEFAULT ''
);
CREATE INDEX idx_session_project_date ON work_session(project_id, date);
`
  }
]
