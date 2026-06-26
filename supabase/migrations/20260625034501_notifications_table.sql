CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type notification_type NOT NULL,
  recipient_email text NOT NULL,
  recipient_name text,
  idea_id uuid NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  locale text NOT NULL DEFAULT 'th',
  subject text NOT NULL,
  status notification_status NOT NULL DEFAULT 'pending',
  error_message text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_notifications_idea_id ON notifications (idea_id);
CREATE INDEX idx_notifications_status ON notifications (status);
CREATE INDEX idx_notifications_type ON notifications (type);
CREATE INDEX idx_notifications_recipient ON notifications (recipient_email);
CREATE INDEX idx_notifications_created ON notifications (created_at DESC);
CREATE INDEX idx_notifications_status_type ON notifications (status, type);

-- RLS Policies
CREATE POLICY "admin_full_access" ON notifications
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "bd_own_notifications" ON notifications
  FOR SELECT TO authenticated
  USING (recipient_email = (SELECT email FROM profiles WHERE id = auth.uid()));

CREATE POLICY "submitter_own_notifications" ON notifications
  FOR SELECT TO authenticated
  USING (idea_id IN (SELECT id FROM ideas WHERE user_id = auth.uid()));
