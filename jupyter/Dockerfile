FROM python:3.11-slim

# Set working directory
WORKDIR /home/jupyter

# Install system dependencies
RUN apt-get update && \
    apt-get install -y git && \
    rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python packages
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Create directory for notebooks
RUN mkdir -p /home/jupyter/notebooks

# Expose Jupyter Lab port
EXPOSE 8888

# Set default command
# Note: In production, you should set a token or password for security
CMD ["jupyter", "lab", "--ip=0.0.0.0", "--port=8888", "--no-browser", "--allow-root", "--NotebookApp.token=", "--NotebookApp.password="]

