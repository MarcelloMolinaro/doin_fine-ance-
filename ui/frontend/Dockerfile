FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies (regenerate lockfile for correct platform)
# This fixes issues with platform-specific optional dependencies (rollup, esbuild)
RUN npm install

# Copy application code
COPY . .

# Expose port
EXPOSE 5173

# Install dependencies on startup (handles volume mount overwriting node_modules)
# Delete package-lock.json if it exists to regenerate for correct platform (fixes rollup/esbuild optional deps)
# Then start the dev server
CMD sh -c "rm -f package-lock.json && npm install && npm run dev"
