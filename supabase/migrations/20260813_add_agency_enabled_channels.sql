-- ============================================================================
-- LUMEN ANALYTICS - PER-AGENCY ENABLED MARKETING CHANNELS MIGRATION
-- ============================================================================

ALTER TABLE public.agencies
ADD COLUMN IF NOT EXISTS enabled_channels TEXT[]
NOT NULL
DEFAULT ARRAY[
  'Google Ads',
  'Meta Ads',
  'TikTok Ads'
]::TEXT[];
