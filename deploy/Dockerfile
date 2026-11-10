# Synthetic-data preview only. This image still runs the app's local Python
# http.server implementation; it is not a production clinical server.
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000

WORKDIR /app

RUN useradd --system --uid 10001 --no-create-home --shell /usr/sbin/nologin aarogya \
    && mkdir -p /data \
    && chown aarogya:aarogya /data

# Copy only the files used by the current app. The repository's image and
# legacy draft files are intentionally excluded from this preview image.
COPY --chown=aarogya:aarogya app.py ./app.py
COPY --chown=aarogya:aarogya app.js ./app.js
COPY --chown=aarogya:aarogya offline-vault.js ./offline-vault.js
COPY --chown=aarogya:aarogya index.html ./index.html
COPY --chown=aarogya:aarogya styles.css ./styles.css
COPY --chown=aarogya:aarogya manifest.json ./manifest.json
COPY --chown=aarogya:aarogya service-worker.js ./service-worker.js
COPY --chown=aarogya:aarogya icon.svg ./icon.svg

USER aarogya
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3).read()"]

CMD ["sh", "-c", "exec python app.py --host 0.0.0.0 --port ${PORT:-8000}"]
