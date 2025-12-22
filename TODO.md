# TODOs

## Short Term
- [ ] Create a config file for the most configgy things
- [ ] Update the Readme (contains a bunch of old instructions)
- [ ] Add Errors form the Simplefin API so the user knows when they run it that it didn't work for which accounts- include instructions
- [ ] Add a Databricks source integration and test end-to-end
- [ ] Add remaining Allegra sources (Chase Allegra, Mntn 1)
- [ ] Remove bloat/tech debt in all of my code
- [ ] Figure out why the job I created doesn't update the dbt assets in the dag that reference the same models? Is there a way to do that?
- [ ] Make the prediction ML much better!
- [ ] Allow the user to re-train the model from the Model Details page?

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

### Step 5: UI for Review & Editing
  - [ ] "Retrain model" button that triggers Dagster job (from Model Details page)
  - [ ] Show model performance metrics on Model Details page

