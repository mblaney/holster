# Use official Node.js runtime as base image
FROM node:20-alpine

# Set working directory in container
WORKDIR /app

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Expose the HTTP port and WebSocket port
EXPOSE 3000 8765

# Run the server
CMD ["node", "src/index.js"]
