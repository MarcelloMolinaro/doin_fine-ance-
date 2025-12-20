{{ config(
    materialized = 'view'
) }}

with 

user_categories as (select * from {{ source('public_sources', 'user_categories') }})

, trxn_details as (select * from {{ ref('fct_trxns_uncategorized') }})

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

    from user_categories as u_cat
    left join trxn_details as details
        on u_cat.transaction_id = details.transaction_id
    where u_cat.validated = true
)

select * from final