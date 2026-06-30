ALTER TABLE system_settings
  ADD COLUMN IF NOT EXISTS prompt_config JSONB DEFAULT '{}';
