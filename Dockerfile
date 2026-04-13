# ============================================================
# Ensemble Backend - Production Dockerfile
# ============================================================
# Multi-stage build for optimized image size
# ============================================================

# --- Stage 1: Build dependencies ---
FROM python:3.11-slim AS builder

WORKDIR /build

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# --- Stage 2: Production image ---
FROM python:3.11-slim AS production

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN groupadd -r ensemble && useradd -r -g ensemble ensemble

# Set working directory
WORKDIR /app

# Copy Python packages from builder stage
COPY --from=builder /install /usr/local

# Copy application code
COPY --chown=ensemble:ensemble . .

# Create data directories
RUN mkdir -p data/ensemble_space data/workspace data/users && \
    chown -R ensemble:ensemble data/

# Switch to non-root user
USER ensemble

# Expose port
EXPOSE 8088

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8088/health || exit 1

# Run the application
CMD ["uvicorn", "core.governance:app", "--host", "0.0.0.0", "--port", "8088", "--workers", "4"]
