# TODOs

## Short Term
- [ ] Add in historic data from 2025
  - [ ] Need to figure out how to combine the new data with the hisotric csv?
  - [ ] Train ML model after adding in this new data so I can retrain as we go.

- [ ] Make the prediction ML much better!
- [x] Map account name so that Historic data matches stg_simplefin (see All Data tab for non matching) - Do distinct on "account"
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


