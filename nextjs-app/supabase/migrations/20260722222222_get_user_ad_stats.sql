CREATE OR REPLACE FUNCTION get_user_ad_stats(p_user_id UUID)
RETURNS TABLE (
  total_ads BIGINT,
  active_ads BIGINT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT 
    COUNT(*) AS total_ads,
    COUNT(*) FILTER (WHERE status = 'active') AS active_ads
  FROM ads
  WHERE user_id = p_user_id;
$$;
