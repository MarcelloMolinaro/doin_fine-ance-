{{ config(
    materialized = 'view',
) }}

with source as ( select * from {{ ref('historic_transactions') }} )

, accounts_mapped as (
    select
        *,
        case 
            when account_name = 'A_united'       then 'Chase United Explorer Credit Card'
            when account_name = 'A_freedom'      then 'Chase Freedom Credit Card'
            when account_name = 'A_mtn1'         then 'Mountain One Checking'
            when account_name = 'M_freedom'      then 'Chase Freedom Premier Credit Card'
            when account_name = 'M_wintrust'     then 'Wintrust Bank Checking'
            when account_name = 'M_sapphire'     then 'Chase Sapphire Credit Card'
            when account_name = 'M_united'       then 'Chase United Explorer Credit Card'
            when account_name = 'Joint_amalg'    then 'Amalgamated Bank Checking'
            when account_name = 'Joint_amex'     then 'American Express Joint Credit Card'
            when account_name = 'A_PastExpenses' then 'Historical Expenses Allegra'
            when account_name = 'M_PastExpenses' then 'Historical Expenses Marcello'
        end as mapped_account_name
        ,
        case 
            when account_name = 'A_united'       then 'Allegra'
            when account_name = 'A_freedom'      then 'Allegra'
            when account_name = 'A_mtn1'         then 'Allegra'
            when account_name = 'M_freedom'      then 'Marcello'
            when account_name = 'M_wintrust'     then 'Marcello'
            when account_name = 'M_sapphire'     then 'Marcello'
            when account_name = 'M_united'       then 'Marcello'
            when account_name = 'Joint_amalg'    then 'Joint'
            when account_name = 'Joint_amex'     then 'Joint'
            when account_name = 'A_PastExpenses' then 'Allegra'
            when account_name = 'M_PastExpenses' then 'Marcello'
        end as owner_name
    from source
)


, final as (

    select
        -- Create transaction_id from account_name | amount | transaction_date | description
        -- Handle NULLs by using COALESCE to convert to empty string
        (coalesce(account_name, '') || '|' || 
         coalesce(amount::text, '') || '|' || 
         coalesce(transaction_date::text, '') || '|' || 
         coalesce(description, '')) as transaction_id,  
        null::text                             as account_id,
        account_name::text                     as original_account_name,
        mapped_account_name::text              as account_name,
        type_account_person_account::text      as detailed_account_name,
        owner_name::text                       as owner_name,
        null::text                             as institution_domain,
        null::text                             as institution_name,
        amount::numeric                        as amount,
        null::timestamp                        as posted,
        null::date                             as posted_date,
        null::timestamp                        as transacted_at,
        transaction_date::date                 as transacted_date,
        description::text                      as description,
        null::boolean                          as pending,
        source_category::text                  as source_category,
        master_category::text                  as master_category,
        null::timestamp                        as import_timestamp,
        to_date(input_date, 'MM/DD/YYYY')      as import_date
    from accounts_mapped

)

select * from final