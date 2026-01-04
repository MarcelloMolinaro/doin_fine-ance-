{{ config(
    materialized = 'incremental',
    unique_key = 'transaction_id',
    merge_strategy = 'append',
) }}

with 

user_categories as ( 
    
    select *
    from {{ ref('stg_user_validated_categories') }} 
    {% if is_incremental() %}
    -- only bring in transactions we don't already have
    -- Does NOT allow for updating existing transactions
    where transaction_id not in (
        select transaction_id from {{ this }} where transaction_id is not null
    )
    {% endif %}
),

bootstrap_trxns as ( 
    
    {% if not is_incremental() %}
        -- historic_validated_transactions:
        select
            transaction_id,
            account_id,
            original_account_name,
            account_name,
            detailed_account_name,
            owner_name,
            -- institution_domain,
            institution_name,
            amount,
            -- posted,
            posted_date,
            -- transacted_at,
            transacted_date,
            description,
            pending,
            source_category,
            master_category,
            import_timestamp,
            import_date,
            source_name,
            null as user_notes,
            null as category_changed_at,
            -- Feature columns (must match stg_user_validated_categories)
            combined_text,
            day_of_week,
            month,
            day_of_month,
            is_negative,
            amount_abs,
            amount_bucket,
            has_hotel_keyword,
            has_gas_keyword,
            has_grocery_keyword,
            has_restaurant_keyword,
            has_transport_keyword,
            has_shop_keyword,
            has_flight_keyword,
            has_credit_fee_keyword,
            has_interest_keyword
        from {{ ref('fct_trxns_categorized') }}

        union all

        select * from user_categories

    {% else %}

        select * from user_categories
    
    {% endif %}
    
    
),

final as (

    select * from bootstrap_trxns
    
)

select * from final
