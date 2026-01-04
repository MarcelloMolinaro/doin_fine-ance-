{{ config(
    materialized = 'view'
) }}

with 

user_categories as (select * from {{ source('public_sources', 'user_categories') }})

, trxn_details as (select * from {{ ref('int_trxns_features') }})

, final as (
    
    select 
        u_cat.transaction_id,
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
        u_cat.source_category,
        coalesce(u_cat.master_category, details.master_category) as master_category,
        import_timestamp,
        import_date,
        source_name,

        u_cat.notes           as user_notes,
        -- u_cat.updated_by,
        u_cat.updated_at      as category_changed_at

        , details.combined_text
        , details.day_of_week
        , details.month
        , details.day_of_month
        , details.is_negative
        , details.amount_abs
        , details.amount_bucket
        , details.has_hotel_keyword
        , details.has_gas_keyword
        , details.has_grocery_keyword
        , details.has_restaurant_keyword
        , details.has_transport_keyword
        , details.has_shop_keyword
        , details.has_flight_keyword
        , details.has_credit_fee_keyword
        , details.has_interest_keyword
        
    from user_categories as u_cat
    left join trxn_details as details
        on u_cat.transaction_id = details.transaction_id
    where u_cat.validated = true
)

select * from final