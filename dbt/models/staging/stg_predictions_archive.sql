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
        prediction_timestamp
    from source
)

select * from final