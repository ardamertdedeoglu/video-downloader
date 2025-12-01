from flask import Flask, render_template, request, jsonify, send_file, Response
import yt_dlp
import os
import uuid
import threading
import re

app = Flask(__name__)

# Download klasörü
DOWNLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'downloads')
if not os.path.exists(DOWNLOAD_FOLDER):
    os.makedirs(DOWNLOAD_FOLDER)

# İndirme durumlarını takip etmek için
download_status = {}

# yt-dlp ortak ayarları
YDL_OPTS_BASE = {
    'quiet': True,
    'no_warnings': True,
    # +18 video bypass seçenekleri
    'age_limit': None,
    'cookiesfrombrowser': ('firefox',),
    # YouTube JS challenge çözümü
    'extractor_args': {'youtube': {'player_client': ['web_creator', 'tv', 'mweb']}},
}

def sanitize_filename(filename):
    """Dosya adından geçersiz karakterleri temizle"""
    return re.sub(r'[<>:"/\\|?*]', '', filename)

def get_video_info(url):
    """Video bilgilerini al"""
    ydl_opts = {
        **YDL_OPTS_BASE,
        'extract_flat': False,
    }
    
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)
        
        # Sabit kalite seçenekleri
        formats = [
            {'format_id': 'best', 'quality': 'En İyi Kalite', 'ext': 'mp4', 'type': 'video+audio'},
            {'format_id': '1080p', 'quality': '1080p (Full HD)', 'ext': 'mp4', 'type': 'video+audio'},
            {'format_id': '720p', 'quality': '720p (HD)', 'ext': 'mp4', 'type': 'video+audio'},
            {'format_id': '480p', 'quality': '480p', 'ext': 'mp4', 'type': 'video+audio'},
            {'format_id': '360p', 'quality': '360p', 'ext': 'mp4', 'type': 'video+audio'},
            {'format_id': 'bestaudio', 'quality': 'Sadece Ses (M4A)', 'ext': 'm4a', 'type': 'audio'},
        ]
        
        return {
            'title': info.get('title', 'Bilinmeyen'),
            'thumbnail': info.get('thumbnail'),
            'duration': info.get('duration'),
            'uploader': info.get('uploader', 'Bilinmeyen'),
            'view_count': info.get('view_count'),
            'formats': formats
        }

def download_video(url, format_id, download_id):
    """Video indir"""
    download_status[download_id] = {'status': 'downloading', 'progress': 0, 'filename': None}
    
    def progress_hook(d):
        if d['status'] == 'downloading':
            total = d.get('total_bytes') or d.get('total_bytes_estimate', 0)
            downloaded = d.get('downloaded_bytes', 0)
            if total > 0:
                download_status[download_id]['progress'] = int((downloaded / total) * 100)
        elif d['status'] == 'finished':
            download_status[download_id]['progress'] = 100

    output_template = os.path.join(DOWNLOAD_FOLDER, f'{download_id}_%(title)s.%(ext)s')
    
    # Kalite bazlı format seçimi
    format_map = {
        'best': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best',
        '1080p': 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best',
        '720p': 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=720]+bestaudio/best',
        '480p': 'bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=480]+bestaudio/best',
        '360p': 'bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=360]+bestaudio/best',
        'bestaudio': 'bestaudio[ext=m4a]/bestaudio/best',
    }
    
    format_string = format_map.get(format_id, format_map['best'])
    
    ydl_opts = {
        **YDL_OPTS_BASE,
        'format': format_string,
        'outtmpl': output_template,
        'progress_hooks': [progress_hook],
        'merge_output_format': 'mp4',
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
        
        # İndirilen dosyayı bul
        for filename in os.listdir(DOWNLOAD_FOLDER):
            if filename.startswith(download_id):
                download_status[download_id]['status'] = 'completed'
                download_status[download_id]['filename'] = filename
                return
        
        download_status[download_id]['status'] = 'error'
        download_status[download_id]['error'] = 'Dosya bulunamadı'
    except Exception as e:
        download_status[download_id]['status'] = 'error'
        download_status[download_id]['error'] = str(e)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/info', methods=['POST'])
def get_info():
    """Video bilgilerini getir"""
    data = request.get_json()
    url = data.get('url')
    
    if not url:
        return jsonify({'error': 'URL gerekli'}), 400
    
    try:
        info = get_video_info(url)
        return jsonify(info)
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/download', methods=['POST'])
def start_download():
    """İndirme başlat"""
    data = request.get_json()
    url = data.get('url')
    format_id = data.get('format_id', 'best')
    
    if not url:
        return jsonify({'error': 'URL gerekli'}), 400
    
    download_id = str(uuid.uuid4())[:8]
    
    # Arka planda indirme başlat
    thread = threading.Thread(target=download_video, args=(url, format_id, download_id))
    thread.start()
    
    return jsonify({'download_id': download_id})

@app.route('/api/status/<download_id>')
def get_status(download_id):
    """İndirme durumunu kontrol et"""
    if download_id not in download_status:
        return jsonify({'error': 'İndirme bulunamadı'}), 404
    
    return jsonify(download_status[download_id])

@app.route('/api/file/<download_id>')
def get_file(download_id):
    """İndirilen dosyayı gönder"""
    if download_id not in download_status:
        return jsonify({'error': 'İndirme bulunamadı'}), 404
    
    status = download_status[download_id]
    if status['status'] != 'completed':
        return jsonify({'error': 'İndirme henüz tamamlanmadı'}), 400
    
    filename = status['filename']
    filepath = os.path.join(DOWNLOAD_FOLDER, filename)
    
    if not os.path.exists(filepath):
        return jsonify({'error': 'Dosya bulunamadı'}), 404
    
    # Dosya adından download_id'yi çıkar
    clean_filename = sanitize_filename(filename[len(download_id)+1:])
    
    response = send_file(filepath, as_attachment=True, download_name=clean_filename)
    
    # İndirme tamamlandıktan sonra dosyayı sil (arka planda)
    def cleanup():
        import time
        time.sleep(60)  # 1 dakika bekle
        try:
            os.remove(filepath)
            if download_id in download_status:
                del download_status[download_id]
        except:
            pass
    
    threading.Thread(target=cleanup, daemon=True).start()
    
    return response

if __name__ == '__main__':
    app.run(debug=True, port=5000)
