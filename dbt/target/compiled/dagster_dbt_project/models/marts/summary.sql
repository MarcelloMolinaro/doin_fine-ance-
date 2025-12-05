WITH joined AS (
  SELECT 
    s1.id, 
    s1.value_x2, 
    s2.score_plus_one, 
    s3.is_a 
    --, w.temperature, w.windSpeed
  FROM "dagster"."public"."source1" s1
  JOIN "dagster"."public"."source2" s2 USING (id)
  JOIN "dagster"."public"."source3" s3 USING (id)
)
SELECT 
  *, 
  (value_x2 + score_plus_one) * is_a AS metric 
FROM joined