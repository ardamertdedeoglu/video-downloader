from flask import Flask, render_template, request, jsonify, send_file, redirect, session, url_for
import yt_dlp
import os
import uuid
import threading
import re
import json
import requests
from urllib.parse import urlencode
import sys

print("[DEBUG] Starting app initialization...", file=sys.stderr)
print(f"[DEBUG] Python version: {sys.version}", file=sys.stderr)
print(f"[DEBUG] Current directory: {os.getcwd()}", file=sys.stderr)
print(f"[DEBUG] Directory contents: {os.listdir('.')}", file=sys.stderr)

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')

print("[DEBUG] Flask app created successfully", file=sys.stderr)

# OAuth ayarları
GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID', '')
GOOGLE_CLIENT_SECRET = os.environ.get('GOOGLE_CLIENT_SECRET', '')
OAUTH_REDIRECT_URI = os.environ.get('OAUTH_REDIRECT_URI', 'http://localhost:5000/oauth/callback')

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

def get_ydl_opts(user_id=None):
    """Kullanıcıya özel yt-dlp ayarları"""
    opts = {
        'quiet': True,
        'no_warnings': True,
        'age_limit': None,
        'extractor_args': {'youtube': {'player_client': ['web_creator', 'tv', 'mweb']}},
    }
    
    # Kullanıcı giriş yapmışsa cookie dosyasını kullan
    if user_id:
        cookie_file = os.path.join(COOKIE_FOLDER, f'{user_id}.txt')
        if os.path.exists(cookie_file):
            opts['cookiefile'] = cookie_file
    
    # Yerel ortamda tarayıcı cookie'si kullan
    if not IS_SERVER:
        for browser in ['firefox', 'chrome', 'edge', 'brave']:
            try:
                opts['cookiesfrombrowser'] = (browser,)
                break
            except:
                continue
    
    return opts

def sanitize_filename(filename):
    """Dosya adından geçersiz karakterleri temizle"""
    return re.sub(r'[<>:"/\\|?*]', '', filename)

def get_video_info(url, user_id=None):
    """Video bilgilerini al"""
    ydl_opts = get_ydl_opts(user_id)
    ydl_opts['extract_flat'] = False
    
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
            'formats': formats,
            'age_restricted': info.get('age_limit', 0) >= 18
        }

def download_video(url, format_id, download_id, user_id=None):
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
    
    format_map = {
        'best': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best',
        '1080p': 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best',
        '720p': 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=720]+bestaudio/best',
        '480p': 'bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=480]+bestaudio/best',
        '360p': 'bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=360]+bestaudio/best',
        'bestaudio': 'bestaudio[ext=m4a]/bestaudio/best',
    }
    
    format_string = format_map.get(format_id, format_map['best'])
    
    ydl_opts = get_ydl_opts(user_id)
    ydl_opts.update({
        'format': format_string,
        'outtmpl': output_template,
        'progress_hooks': [progress_hook],
        'merge_output_format': 'mp4',
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

# ============ OAuth Routes ============

@app.route('/oauth/login')
def oauth_login():
    """Google OAuth ile giriş başlat"""
    if not GOOGLE_CLIENT_ID:
        return jsonify({'error': 'OAuth yapılandırılmamış'}), 500
    
    state = str(uuid.uuid4())
    session['oauth_state'] = state
    
    params = {
        'client_id': GOOGLE_CLIENT_ID,
        'redirect_uri': OAUTH_REDIRECT_URI,
        'response_type': 'code',
        'scope': 'https://www.googleapis.com/auth/youtube.readonly email profile',
        'access_type': 'offline',
        'prompt': 'consent',
        'state': state
    }
    
    auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"
    return redirect(auth_url)

@app.route('/oauth/callback')
def oauth_callback():
    """OAuth callback"""
    error = request.args.get('error')
    if error:
        return redirect(f'/?error={error}')
    
    code = request.args.get('code')
    state = request.args.get('state')
    
    if state != session.get('oauth_state'):
        return redirect('/?error=invalid_state')
    
    token_url = 'https://oauth2.googleapis.com/token'
    token_data = {
        'client_id': GOOGLE_CLIENT_ID,
        'client_secret': GOOGLE_CLIENT_SECRET,
        'code': code,
        'grant_type': 'authorization_code',
        'redirect_uri': OAUTH_REDIRECT_URI
    }
    
    try:
        token_response = requests.post(token_url, data=token_data)
        tokens = token_response.json()
        
        if 'error' in tokens:
            return redirect(f'/?error={tokens["error"]}')
        
        access_token = tokens.get('access_token')
        
        user_info_response = requests.get(
            'https://www.googleapis.com/oauth2/v2/userinfo',
            headers={'Authorization': f'Bearer {access_token}'}
        )
        user_info = user_info_response.json()
        
        user_id = user_info.get('id', str(uuid.uuid4()))
        
        session['user_id'] = user_id
        session['user_email'] = user_info.get('email', '')
        session['user_name'] = user_info.get('name', '')
        session['access_token'] = access_token
        session['logged_in'] = True
        
        # Cookie dosyası oluştur
        cookie_file = os.path.join(COOKIE_FOLDER, f'{user_id}.txt')
        create_youtube_cookie_file(cookie_file, access_token)
        
        return redirect('/')
        
    except Exception as e:
        return redirect(f'/?error={str(e)}')

@app.route('/oauth/logout', methods=['GET', 'POST'])
def oauth_logout():
    """Çıkış yap"""
    user_id = session.get('user_id')
    if user_id:
        cookie_file = os.path.join(COOKIE_FOLDER, f'{user_id}.txt')
        if os.path.exists(cookie_file):
            os.remove(cookie_file)
    
    session.clear()
    if request.method == 'POST':
        return jsonify({'success': True})
    return redirect('/')

@app.route('/oauth/status')
def auth_status():
    """Kullanıcı giriş durumu"""
    if session.get('logged_in'):
        return jsonify({
            'logged_in': True,
            'user_name': session.get('user_name', ''),
            'email': session.get('user_email', '')
        })
    return jsonify({'logged_in': False})

def create_youtube_cookie_file(filepath, access_token):
    """YouTube için Netscape cookie dosyası oluştur"""
    cookie_content = f"""# Netscape HTTP Cookie File
# This file was generated by video-downloader
.youtube.com\tTRUE\t/\tTRUE\t0\tCONSENT\tYES+
.youtube.com\tTRUE\t/\tTRUE\t0\tPREF\tf4=4000000
.youtube.com\tTRUE\t/\tTRUE\t0\tLOGIN_INFO\t{access_token[:50]}
"""
    with open(filepath, 'w') as f:
        f.write(cookie_content)

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
    
    user_id = session.get('user_id')
    
    try:
        info = get_video_info(url, user_id)
        info['logged_in'] = session.get('logged_in', False)
        return jsonify(info)
    except Exception as e:
        error_msg = str(e)
        if 'Sign in to confirm your age' in error_msg or 'age' in error_msg.lower():
            return jsonify({
                'error': 'Bu video yaş kısıtlamalı. İndirmek için Google ile giriş yapın.',
                'requires_login': True
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
    user_id = session.get('user_id')
    
    thread = threading.Thread(target=download_video, args=(url, format_id, download_id, user_id))
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
