{{ config(
    materialized = 'view',
) }}

with 

source as ( select * from {{ source('predictions_sources', 'predicted_transactions') }} )

, final as (

    select
        transaction_id,
        predicted_master_category,
        prediction_confidence,
        model_version,
        prediction_timestamp,
        row_number() over (partition by transaction_id order by prediction_timestamp desc) as rn
    from source
)

select * from final where rn = 1