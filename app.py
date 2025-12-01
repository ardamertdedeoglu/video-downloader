from flask import Flask, render_template, request, jsonify, send_file, session
import yt_dlp
import os
import uuid
import threading
import re
import sys

print("[DEBUG] Starting app initialization...", file=sys.stderr)

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')
app.config['MAX_CONTENT_LENGTH'] = 1 * 1024 * 1024  # 1MB max cookie file

# Download klasörü
DOWNLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'downloads')
try:
    if not os.path.exists(DOWNLOAD_FOLDER):
        os.makedirs(DOWNLOAD_FOLDER)
except Exception as e:
    print(f"Warning: Could not create downloads folder: {e}")

# Cookie dosyası klasörü
COOKIE_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'cookies')
try:
    if not os.path.exists(COOKIE_FOLDER):
        os.makedirs(COOKIE_FOLDER)
except Exception as e:
    print(f"Warning: Could not create cookies folder: {e}")

# İndirme durumlarını takip etmek için
download_status = {}

# Ortam tespiti
IS_SERVER = os.environ.get('RAILWAY_ENVIRONMENT') or os.environ.get('RENDER') or os.environ.get('FLY_APP_NAME')

print(f"[DEBUG] IS_SERVER: {IS_SERVER}", file=sys.stderr)

def get_ydl_opts(cookie_file=None):
    """yt-dlp ayarları"""
    opts = {
        'quiet': True,
        'no_warnings': True,
        'age_limit': None,
        # 'extractor_args': {'youtube': {'player_client': ['web_creator', 'tv', 'mweb']}},
    }
    
    # Cookie dosyası varsa kullan
    if cookie_file and os.path.exists(cookie_file):
        opts['cookiefile'] = cookie_file
        print(f"[DEBUG] Using cookie file: {cookie_file}", file=sys.stderr)
    
    # Yerel ortamda tarayıcı cookie'si kullan
    elif not IS_SERVER:
        for browser in ['firefox', 'chrome', 'edge', 'brave']:
            try:
                opts['cookiesfrombrowser'] = (browser,)
                print(f"[DEBUG] Using browser cookies: {browser}", file=sys.stderr)
                break
            except:
                continue
    
    return opts

def sanitize_filename(filename):
    """Dosya adından geçersiz karakterleri temizle"""
    return re.sub(r'[<>:"/\\|?*]', '', filename)

def get_video_info(url, cookie_file=None):
    """Video bilgilerini al"""
    ydl_opts = get_ydl_opts(cookie_file)
    ydl_opts['extract_flat'] = False
    
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)
        
        # Mevcut formatları logla
        available_formats = info.get('formats', [])
        print(f"[DEBUG] Available formats count: {len(available_formats)}", file=sys.stderr)
        for f in available_formats[:5]:  # İlk 5 formatı göster
            print(f"[DEBUG] Format: {f.get('format_id')} - {f.get('ext')} - {f.get('height')}p", file=sys.stderr)
        
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
            'formats': formats,
            'age_restricted': info.get('age_limit', 0) >= 18
        }

def download_video(url, format_id, download_id, cookie_file=None):
    """Video indir"""
    print(f"[DEBUG] Starting download for {download_id} with cookie: {cookie_file}", file=sys.stderr)
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
    
    # Basitleştirilmiş format seçenekleri
    if format_id == 'bestaudio':
        format_string = 'bestaudio/best'
    elif format_id == '1080p':
        format_string = 'bv*[height<=1080]+ba/b[height<=1080]/b'
    elif format_id == '720p':
        format_string = 'bv*[height<=720]+ba/b[height<=720]/b'
    elif format_id == '480p':
        format_string = 'bv*[height<=480]+ba/b[height<=480]/b'
    elif format_id == '360p':
        format_string = 'bv*[height<=360]+ba/b[height<=360]/b'
    else:  # best
        format_string = 'bv*+ba/b'
    
    print(f"[DEBUG] Using format string: {format_string}", file=sys.stderr)
    
    ydl_opts = get_ydl_opts(cookie_file)
    ydl_opts.update({
        'format': format_string,
        'outtmpl': output_template,
        'progress_hooks': [progress_hook],
        'merge_output_format': 'mp4',
        # FFmpeg ayarları
        'prefer_ffmpeg': True,
        'postprocessor_args': {
            'ffmpeg': ['-c:v', 'copy', '-c:a', 'aac']
        },
    })
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
        
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

# ============ Cookie Upload Routes ============

@app.route('/api/cookie/upload', methods=['POST'])
def upload_cookie():
    """Cookie dosyası yükle"""
    if 'cookie_file' not in request.files:
        return jsonify({'error': 'Cookie dosyası gerekli'}), 400
    
    file = request.files['cookie_file']
    if file.filename == '':
        return jsonify({'error': 'Dosya seçilmedi'}), 400
    
    # Session ID oluştur veya mevcut olanı kullan
    if 'session_id' not in session:
        session['session_id'] = str(uuid.uuid4())
    
    session_id = session['session_id']
    cookie_path = os.path.join(COOKIE_FOLDER, f'{session_id}.txt')
    
    try:
        content = file.read().decode('utf-8')
        
        # Netscape cookie formatını kontrol et
        if '# Netscape HTTP Cookie File' not in content and '.youtube.com' not in content:
            return jsonify({'error': 'Geçersiz cookie dosyası formatı. Netscape formatında olmalı.'}), 400
        
        with open(cookie_path, 'w') as f:
            f.write(content)
        
        session['has_cookies'] = True
        print(f"[DEBUG] Cookie uploaded for session: {session_id}", file=sys.stderr)
        
        return jsonify({'success': True, 'message': 'Cookie dosyası başarıyla yüklendi'})
    except Exception as e:
        return jsonify({'error': f'Cookie yüklenirken hata: {str(e)}'}), 500

@app.route('/api/cookie/status')
def cookie_status():
    """Cookie durumunu kontrol et"""
    session_id = session.get('session_id')
    has_cookies = False
    
    if session_id:
        cookie_path = os.path.join(COOKIE_FOLDER, f'{session_id}.txt')
        has_cookies = os.path.exists(cookie_path)
    
    return jsonify({
        'has_cookies': has_cookies,
        'session_id': session_id
    })

@app.route('/api/cookie/delete', methods=['POST'])
def delete_cookie():
    """Cookie dosyasını sil"""
    session_id = session.get('session_id')
    if session_id:
        cookie_path = os.path.join(COOKIE_FOLDER, f'{session_id}.txt')
        if os.path.exists(cookie_path):
            os.remove(cookie_path)
    
    session.pop('has_cookies', None)
    return jsonify({'success': True})

def get_user_cookie_file():
    """Kullanıcının cookie dosyasını al"""
    session_id = session.get('session_id')
    if session_id:
        cookie_path = os.path.join(COOKIE_FOLDER, f'{session_id}.txt')
        if os.path.exists(cookie_path):
            return cookie_path
    return None

# ============ Main Routes ============

@app.route('/health')
def health_check():
    """Health check endpoint"""
    return jsonify({'status': 'ok', 'message': 'Application is running'})

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
    
    cookie_file = get_user_cookie_file()
    
    try:
        info = get_video_info(url, cookie_file)
        info['has_cookies'] = session.get('has_cookies', False)
        return jsonify(info)
    except Exception as e:
        error_msg = str(e)
        if 'Sign in to confirm your age' in error_msg or 'age' in error_msg.lower():
            return jsonify({
                'error': 'Bu video yaş kısıtlamalı. Lütfen cookie dosyanızı yükleyin.',
                'requires_cookies': True
            }), 403
        return jsonify({'error': error_msg}), 400

@app.route('/api/download', methods=['POST'])
def start_download():
    """İndirme başlat"""
    data = request.get_json()
    url = data.get('url')
    format_id = data.get('format_id', 'best')
    
    if not url:
        return jsonify({'error': 'URL gerekli'}), 400
    
    download_id = str(uuid.uuid4())[:8]
    cookie_file = get_user_cookie_file()
    
    thread = threading.Thread(target=download_video, args=(url, format_id, download_id, cookie_file))
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
    
    clean_filename = sanitize_filename(filename[len(download_id)+1:])
    
    response = send_file(filepath, as_attachment=True, download_name=clean_filename)
    
    def cleanup():
        import time
        time.sleep(60)
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
