-- Notification enums for notification-tracking unit
CREATE TYPE notification_type AS ENUM (
  'idea_received',
  'analysis_complete',
  'documents_ready',
  'stage_changed',
  'idea_approved',
  'idea_rejected',
  'bd_new_idea'
);

CREATE TYPE notification_status AS ENUM (
  'pending',
  'sent',
  'failed'
);
