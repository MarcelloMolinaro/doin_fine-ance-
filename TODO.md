# TODOs

## Short Term
- [ ] Train ML model after adding in this new data so I can retrain as we go.
- [ ] Build out the Model Details tab - Find out what informatio would be helpful to know?
- [ ] Create a config file for the most configgy things
  - [ ] Create account mapping seed and dbt_model
  - [ ] Create list of transaction things to exclude (i.e. credit card payments)
- [ ] Add a Databricks source integration and test end-to-end
- [ ] Remove bloat/tech debt in all of my code
- [ ] Consider make key referenced VIEW's -> tables - Would requiring adding dbt steps to button triggers
- [ ] Postgres - Bad = Pulling revelvant file; good = postgres DUMP
- [ ] Tech debt: rename Jobs/refresh_validated_trxns to refresh_validated_trxns_pipeline


## Long Term
- [ ] What's up with the .user.yml file? untrack that?
- [ ] Learn about ML classifiers? Why are we using random forest here? What is Vectorized text?
  - [ ] Check out Ian's documents to see if they have good explanation
- [ ] Add a flow for "Import CSV" of historic transaction


## Will not/Can not do
- [x] How to leverage the built in AMEX categories? Can i get them via simplefin? explore.
  - SAD :()


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


