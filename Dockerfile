# Python base image
FROM python:3.11-slim

# FFmpeg yükle
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

# Çalışma dizini
WORKDIR /app

# Requirements kopyala ve yükle
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn

# Uygulama dosyalarını kopyala
COPY . .

# Downloads klasörünü oluştur
RUN mkdir -p downloads

# Port
EXPOSE 5000

# Çalıştır
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:5000", "app:app"]
