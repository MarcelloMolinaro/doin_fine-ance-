FROM python:3.11-slim

# Set working directory
WORKDIR /opt/dagster/app

# Install system dependencies
RUN apt-get update && \
    apt-get install -y git && \
    rm -rf /var/lib/apt/lists/*

# Install Dagster, Dagit, dbt, and ML dependencies
RUN pip install --no-cache-dir \
    dagster \
    dagster-postgres \
    dagit \
    dagster-dbt \
    pandas \
    SQLAlchemy \
    requests \
    psycopg2-binary \
    dbt-postgres \
    scikit-learn \
    joblib \
    numpy \
    scipy \
    pyyaml
# Copy the Dagster project files
COPY . .

# Environment variables
ENV DAGSTER_HOME=/opt/dagster/app
ENV DBT_PROFILES_DIR=/opt/dbt

# Start Dagster webserver (future-proof replacement for dagit)
CMD ["dagster-webserver", "-h", "0.0.0.0", "-p", "3000", "-f", "/opt/dagster/app/repo.py"]
