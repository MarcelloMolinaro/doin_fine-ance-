FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install

# Copy application code
COPY . .

# Expose port
EXPOSE 5173

# Install dependencies on startup (handles volume mount overwriting node_modules)
# Then start the dev server
CMD sh -c "npm install && npm run dev"
