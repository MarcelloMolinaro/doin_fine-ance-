{{ config(
    materialized = 'table'
) }}

with 

src as (select * from {{ ref('fct_trxns_uncategorized') }}),

predictions as (select * from {{ ref('stg_predictions') }}),

final as (
    
    select 
        src.*,
        predictions.predicted_master_category,
        predictions.prediction_confidence,
        predictions.model_version,
        predictions.prediction_timestamp

        -- Columns we don't need?
        -- source_name,
        -- combined_text,
        -- day_of_week,
        -- month,
        -- day_of_month,
        -- is_negative,
        -- amount_abs,
        -- amount_bucket,
        -- has_hotel_keyword,
        -- has_gas_keyword,
        -- has_grocery_keyword,
        -- has_restaurant_keyword
        -- has_transport_keyword,
        -- has_shop_keyword
        
    from src
    left join predictions on src.transaction_id = predictions.transaction_id
)

select * from final