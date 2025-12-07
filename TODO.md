# TODOs

[x] Build Python models to pull data from SimpleFIN
   - Resolve all to-do's in the simplefin_api.py doc
- Enable dbt <> dagster connection so I don't need to define each source? I haven't built any of this out yet
[ ] Add a Databricks source integration and test end-to-end
[ ] Stop truncating source tables and start inserting/appending (especially finance data!)
   - create a qualify statement that only takes the most recent data and handles dupes!
[ ] Add remaining sources (Chase Marcello, Chase Allegra, Mntn 1)

- Delete committed artifacts/logs and tighten `.gitignore`
- [SKipping for now] ~Create a config files that manages all secrets, passwords, etc.~
- Move profiles OUT of dbt or stop tracking it, or both

# Resources
- SimpleFin Dev Tools: https://www.simplefin.org/protocol.html
- https://beta-bridge.simplefin.org/my-account

### Testing
You can test the extractor directly in the Dagster container without running the full Dagster UI:

**Option 1: Run directly in the container**
```bash
# Make sure your container is running
docker-compose up -d

# Run the extractor
docker-compose exec dagster python /opt/dagster/app/extractors/simplefin_api.py
```

Next steps - Categories!

## ML Transaction Categorization Pipeline

### Step 3: Train Model on Historical Data
- [ ] Create Dagster asset for model training
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
- [ ] Create Dagster asset for inference
  - Load trained model artifact
  - Run inference on new SimpleFin transactions
  - Add `prediction_category` and `prediction_score` columns
  - Write predictions back to DB (new table or append to existing)
  - Handle confidence thresholds (maybe only predict if score > threshold)
  - Track model version used for each prediction

### Step 5: UI for Review & Editing
- [ ] Build Streamlit app (recommended) or alternative UI
  - Display transactions with predictions
  - Filter by: low confidence, uncategorized, date range, etc.
  - Allow editing/correcting categories
  - Save corrections back to DB
  - "Retrain model" button that triggers Dagster job
  - Show model performance metrics

### Classifier Strategy

**1. Clean + Vectorize Transaction Text**

Use only features that generalize well:
- Merchant name
- Description text
- MCC code (if available)
- Amount (optional, but helpful)

Turn text into embeddings using either:
- **Simple**: TF-IDF
- **Better**: Sentence embeddings (e.g., miniLM, all-mpnet)

**2. Train a Lightweight Classifier**

**Option A (simple + very effective):**
- k-NN classifier on embeddings
- No training cost
- Very interpretable (closest example transactions)
- Gives you a "confidence score" = distance to nearest neighbors

**Option B:**
- Logistic Regression or Linear SVM on TF-IDF
- Fast
- High accuracy if text patterns are stable
- Probabilities give you prediction score

**Option C:**
- Small neural model finetuned on your embeddings
- Best for large datasets
- Typically overkill for personal finance apps

**3. Generate "Predictive Score"**

Use one of:
- k-NN → inverse distance to nearest neighbors
- Logistic Regression → predict_proba
- SVM → convert margin to pseudo-probability (Platt scaling)
- For embeddings → cosine similarity to closest labeled transaction

Return it as confidence: e.g., 0–1.

**4. Validate Model**

Split your labeled transactions:
- Train: 80%
- Test: 20%

Compute:
- Accuracy
- Macro F1 (good if classes are imbalanced)
- Confusion matrix (shows which categories get mixed up)
- Calibration curve (checks whether your confidence scores are meaningful)

If very imbalanced, use stratified sampling.

**🔥 Quick Recommended Path (simple + effective):**
1. Compute sentence embeddings for all transactions
2. Fit a k-NN classifier
3. Predict new transaction category
4. Confidence = cosine similarity to the nearest labeled example
5. Evaluate via accuracy + F1 on a held-out set
