WITH joined AS (
  SELECT 
    s1.id, 
    s1.value_x2, 
    s2.score_plus_one, 
    s3.is_a 
    --, w.temperature, w.windSpeed
  FROM {{ ref('source1') }} s1
  JOIN {{ ref('source2') }} s2 USING (id)
  JOIN {{ ref('source3') }} s3 USING (id)
)
SELECT 
  *, 
  (value_x2 + score_plus_one) * is_a AS metric 
FROM joined