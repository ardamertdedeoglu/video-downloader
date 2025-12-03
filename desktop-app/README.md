# Video Downloader - Desktop App

YouTube, Twitter, Instagram ve 1000+ siteden video indirmenizi sağlayan masaüstü uygulaması.

## Özellikler

- 🎬 1000+ siteden video indirme
- 🔐 Yaş kısıtlamalı videoları destekler (tarayıcı çerezleri ile)
- 🎵 MP3 olarak ses indirme
- 📁 Özelleştirilebilir indirme klasörü
- 🌐 Çoklu tarayıcı desteği (Chrome, Firefox, Edge, Brave, Opera)
- 🔄 Otomatik güncelleme
- 💻 Windows, macOS ve Linux desteği

## Kurulum

### Geliştirici Kurulumu

```bash
# Bağımlılıkları yükle
npm install

# Uygulamayı başlat (geliştirme modu)
npm run dev

# Uygulamayı normal başlat
npm start
```

### Derleme

```bash
# Windows için
npm run build:win

# macOS için
npm run build:mac

# Linux için
npm run build:linux

# Tüm platformlar
npm run build
```

## İlk Çalıştırma

Uygulama ilk açıldığında otomatik olarak `yt-dlp` ve `ffmpeg` bileşenlerini indirir. Bu işlem internet hızınıza bağlı olarak birkaç dakika sürebilir.

## Yaş Kısıtlamalı Videolar

+18 veya yaş doğrulaması gerektiren videolar için:

1. Ayarlar'dan kullandığınız tarayıcıyı seçin
2. O tarayıcıda YouTube'a giriş yapın
3. Video URL'sini yapıştırın

Uygulama tarayıcınızın çerezlerini kullanarak yaş doğrulamasını otomatik olarak geçecektir.

## Teknolojiler

- Electron
- yt-dlp
- FFmpeg
- electron-builder

## Lisans

MIT
