FROM alpine:latest

WORKDIR /app

# Install dependencies for downloading
RUN apk add --no-cache ca-certificates wget unzip

# Download the correct PocketBase binary (linux amd64)
RUN wget https://github.com/pocketbase/pocketbase/releases/download/v0.25.9/pocketbase_0.25.9_linux_amd64.zip \
    && unzip pocketbase_0.25.9_linux_amd64.zip \
    && rm pocketbase_0.25.9_linux_amd64.zip \
    && chmod +x ./pocketbase

# Copy your existing data
COPY pb_data ./pb_data

# Use Railway's PORT environment variable
CMD ./pocketbase serve --http=0.0.0.0:${PORT:-8090}
