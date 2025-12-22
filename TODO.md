# TODOs

## Short Term
- [x] Build classifier to categorize new transactions
  - [x] Add recommended Features to Add
  - [x] Test running the prediction.py!
- [x] Build Python models to pull data from SimpleFIN
  - [x] Resolve all to-do's in the simplefin_api.py doc
- [x] Enable dbt <> dagster connection so I don't need to define each source? I haven't built any of this out yet
- [ ] Add a Databricks source integration and test end-to-end
- [x] Stop truncating source tables and start inserting/appending (especially finance data!)
  - [x] create a qualify statement that only takes the most recent data and handles dupes!
- [x] Add remaining Marcello sources (Chase Marcello)
- [ ] Add remaining Allegra sources (Chase Allegra, Mntn 1)
- [ ] Remove bloat/tech debt in all of my code
- [ ] Figure out why the job I created doesn't update the dbt assets in the dag that reference the same models? Is there a way to do that?
- [ ] Make the prediction ML much better!
- [ ] Allow the user to re-train the model from the Model Details page?

## Long Term
- [ ] What's up with the .user.yml file? untrack that?
- [ ] Learn about ML classifiers? Why are we using random forest here? What is Vectorized text?
  - [ ] Check out Ian's documents to see if they have good explanation

## Done  Won't Do!
- [x] Delete committed artifacts/logs and tighten `.gitignore`
- [x] [SKipping for now] ~Create a config files that manages all secrets, passwords, etc.~
- [x] Move profiles OUT of dbt or stop tracking it, or both


# Resources
- SimpleFin Dev Tools: https://www.simplefin.org/protocol.html
- https://beta-bridge.simplefin.org/my-account

# Next steps - Categories!

## ML Transaction Categorization Pipeline

### Step 3.1 Recommended Features to Add (for ML improvements)
A. Transaction Date Features (recommended)
  Day of week (0-6)
  Month (1-12)
  Day of month (1-31)
  Why: Some categories are time-based (e.g., Rent on the 1st, utilities monthly, groceries on weekends).
B. Amount Derived Features (recommended)
  is_negative (boolean)
  amount_abs (absolute value)
  Why: Distinguishes income vs expenses.
C. Source Category (if available)
  Include source_category in text features if it exists.
  Why: Historic data already has category hints.


### Step 3: Train Model on Historical Data
- [x] Create Dagster asset for model training
  - Read unified transactions from dbt (historical + simplefin combined)
  - Split data: 80% train, 20% test (stratified if imbalanced)
  - Feature engineering:
    - Merchant name
    - Description text
    - MCC code (if available)
    - Amount (optional)
  - Vectorize text using embeddings (TF-IDF or sentence embeddings)
  - Train classifier (see classifier options below)
  - Evaluate: Accuracy, Macro F1, Confusion Matrix, Calibration Curve
  - Save model artifact (pickle/joblib) to shared location
  - Log model version and metrics

### Step 4: Run Model on New Data & Add Predictions
- [x] Create Dagster asset for inference
  - [x] Load trained model artifact
  - [x] Run inference on new SimpleFin transactions
  - [x] Add `prediction_category` and `prediction_score` columns
  - [x] Write predictions back to DB (`analytics.predicted_transactions`)
  - [x] Handle confidence thresholds (currently 0.45)
  - [x] Track model version used for each prediction

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

### Step 5: UI for Review & Editing
- [x] Build React UI for transaction categorization
  - [x] Display transactions with predictions
  - [x] Filter by: low confidence, uncategorized, date range, description
  - [x] Allow editing/correcting categories
  - [x] Save corrections back to DB
  - [x] Bulk actions (select all, validate selected)
  - [x] Pagination
  - [x] Color-coded categories
  - [x] "All Data" tab for viewing validated transactions
  - [x] "Refresh Validated Transactions" button (triggers Dagster job)
  - [ ] "Retrain model" button that triggers Dagster job (from Model Details page)
  - [ ] Show model performance metrics on Model Details page

