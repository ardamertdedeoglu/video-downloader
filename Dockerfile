# Python base image
FROM python:3.11-slim

# FFmpeg yükle
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg && \
    rm -rf /var/lib/apt/lists/* && \
    apt-get clean

# Çalışma dizini
WORKDIR /app

# Requirements kopyala ve yükle
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Uygulama dosyalarını kopyala
COPY . .

# Downloads ve cookies klasörlerini oluştur
RUN mkdir -p downloads cookies

# Çalıştır - Railway PORT ortam değişkenini kullanır
CMD ["sh", "-c", "exec gunicorn --bind 0.0.0.0:${PORT:-8080} --workers 1 --threads 2 --timeout 300 --preload --error-logfile - --access-logfile - --capture-output app:app"]
