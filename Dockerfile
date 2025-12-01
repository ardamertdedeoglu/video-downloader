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

# Port - Railway otomatik atar
ENV PORT=5000
EXPOSE 5000

# Çalıştır
CMD gunicorn -w 2 -b 0.0.0.0:$PORT --timeout 300 app:app
