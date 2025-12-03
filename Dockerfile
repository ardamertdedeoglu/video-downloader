# Python base image
FROM python:3.11-slim

# FFmpeg ve Deno yükle
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg curl unzip && \
    curl -fsSL https://deno.land/install.sh | sh && \
    rm -rf /var/lib/apt/lists/* && \
    apt-get clean

# Deno'yu PATH'e ekle
ENV DENO_INSTALL="/root/.deno"
ENV PATH="${DENO_INSTALL}/bin:${PATH}"

# Çalışma dizini
WORKDIR /app

# Requirements kopyala ve yükle
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# yt-dlp'yi EJS ile yükle (n-challenge için gerekli)
RUN pip install --upgrade "yt-dlp[default]"

# Uygulama dosyalarını kopyala
COPY . .

# Downloads ve cookies klasörlerini oluştur
RUN mkdir -p downloads cookies

# Health check için
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8080}/health || exit 1

# Çalıştır - Railway PORT ortam değişkenini kullanır
# --keep-alive: bağlantıları açık tut
# --graceful-timeout: graceful shutdown için süre
CMD ["sh", "-c", "exec gunicorn --bind 0.0.0.0:${PORT:-8080} --workers 1 --threads 4 --timeout 300 --keep-alive 65 --graceful-timeout 30 --preload --error-logfile - --access-logfile - --capture-output app:app"]
