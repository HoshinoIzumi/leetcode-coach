# Build the frontend
FROM node:22-slim AS web
WORKDIR /build/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# Run the API + serve the built frontend
FROM python:3.13-slim
WORKDIR /app
COPY pyproject.toml README.md ./
COPY coach/ coach/
RUN pip install --no-cache-dir ".[web]"
COPY --from=web /build/web/dist web/dist

# Learning history lives here — mount a volume so it survives restarts.
ENV LEETCODE_COACH_HOME=/data
ENV COACH_WEB_DIST=/app/web/dist
VOLUME /data

EXPOSE 8000
CMD ["uvicorn", "coach.api:app", "--host", "0.0.0.0", "--port", "8000"]
