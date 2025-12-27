# TODOs

## Short Term
- [ ] Add in historic data from 2025
  - [ ] Need to figure out how to combine the new data with the hisotric csv?
  - [ ] Train ML model after adding in this new data so I can retrain as we go.
    account_name | Blue Cash Preferred®        | 2025-09-08
    account_name | Chase Freedom Unlimited (M)     | 2025-09-23
    account_name | Junior Savers Savings       | 2025-06-30
    account_name | ONLINE CHECKING-3633        | 2025-10-27
    account_name | Student Checking            | 2025-07-25
    account_name | United Explorer             | 2025-10-01
    account_name | VISTA Personal Money Market | 2025-09-30
    account_name | VISTA Premier Checking      | 2025-09-26


      mapped_account_name   Last input historic | first_trxn 
--------------------------+------------------------
 Amalgamated              |  2/4/2025    2025-10-27  | Done
 Amex Shared              |  02/03/2025  2025-09-08  | Done
 Chase Freedom - Allegra  |  1/8/2025    2025-09-27  |
 Chase United - Allegra   |  10/1/2024   2025-10-01  |
 Chase Freedom - Marcello |  1/13/2025   2025-09-23  | Done
 Chase United - Marcello  |  1/26/2025   2025-10-11  | Done
 Chase Sapphire - Marcello | 1/26/2025   N/A.        | Done
 Mountain One - Checking  |  2/3/2025    2025-09-26  |
 Mountain One - Savings   |  2/3/2025    2025-09-30  |
 Wintrust Checking        |  2/3/2025    2025-07-25  | Done
 Wintrust Savings         |  2/3/2025    2025-06-30  | Done

- [ ] Make the prediction ML much better!
- [ ] How to leverage the built in AMEX categories? Can i get them via simplefin? explore.
- [ ] Build out the Model Details tab - Find out what informatio would be helpful to know?
- [x] Exclude Autopayment credit card transactions etc. -like we do in gsheets - Do this in SQL
  - Done in stg_simplefin
- [ ] Create a config file for the most configgy things
- [ ] Update the Readme (contains a bunch of old instructions)
- [ ] Add a Databricks source integration and test end-to-end
- [ ] Remove bloat/tech debt in all of my code
- [ ] Consider make key referenced VIEW's tables - Would requiring adding dbt steps to button triggers

## Long Term
- [ ] What's up with the .user.yml file? untrack that?
- [ ] Learn about ML classifiers? Why are we using random forest here? What is Vectorized text?
  - [ ] Check out Ian's documents to see if they have good explanation


# Resources
- SimpleFin Dev Tools: https://www.simplefin.org/protocol.html
- https://beta-bridge.simplefin.org/my-account

#### Current Status & Issues (as of Dec 22 2024):
**Model Performance:**
- ✅ Precision: HIGH (80%) - predictions are accurate when made
- ❌ Recall: LOW (55%) - missing many transactions
- ⚠️ With confidence_threshold=0.45, not predicting enough transactions
- Model trained on 2022+ data only, ~4,500 training samples

**Improvements Needed:**
- [ ] **Adjust model parameters** to improve recall without sacrificing too much precision
  - Consider adding back `class_weight='balanced'`
  - Adjust confidence threshold (maybe 0.35-0.40)
  - Experiment with different max_depth, min_samples_leaf values
- [ ] **Build dbt models** to incorporate predictions in a way that surfaces the data
  - Create view/table that combines original transactions with predictions
  - Add logic to surface high-confidence predictions vs uncertain ones
  - Create summary tables by category, confidence level, date, etc.


