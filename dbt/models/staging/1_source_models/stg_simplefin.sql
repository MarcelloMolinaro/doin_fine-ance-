{{ config(
    materialized = 'view',
) }}

with source as (
    select * from {{ source('public_sources', 'simplefin') }}
)

, account_mapping as (
    select * from {{ ref('seed_account_mapping_simplefin') }}
)

, transaction_exclusions as (
    select pattern from {{ ref('seed_transaction_exclusions') }}
)

, final as (

    select
        source.transaction_id,
        source.account_id,
        source.account_name,
        coalesce(
            account_mapping.mapped_account_name::text,
            -- source.account_name, -- remove this if you want to force a mapping
            'Missing mapping! Add to seed_account_mapping_simplefin.csv'
        ) as mapped_account_name,
        source.institution_domain,
        source.institution_name,
        source.amount::numeric             as amount,
        to_timestamp(source.posted)        as posted,
        source.posted_date::date           as posted_date,
        to_timestamp(source.transacted_at) as transacted_at,
        source.transacted_date::date       as transacted_date,
        source.description,
        source.pending,
        source.import_timestamp::timestamp as import_timestamp,
        source.import_date::timestamp      as import_date,
        row_number() over (
            partition by source.transaction_id
            order by source.import_timestamp desc
        ) as unique__check
    from source
    left join account_mapping
        on source.account_name::text = account_mapping.account_name::text
        and (
            account_mapping.account_id is null
            or account_mapping.account_id::text = ''
            or source.account_id::text = account_mapping.account_id::text
        )
    where not exists (
        select 1
        from transaction_exclusions
        where source.description ilike transaction_exclusions.pattern
    )

)

select * 
from final
-- Not available in Postgres: qualify row_number() over (partition by transaction_id order by import_timestamp desc) = 1
where unique__check = 1
