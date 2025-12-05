#!/usr/bin/env python3
"""
Video Downloader uygulama ikonları oluşturur.
Gerekli paketler: pip install Pillow

Windows için: icon.ico
macOS için: icon.iconset
Linux için: icon.png (256x256)
"""

import os
import sys
import math

try:
    from PIL import Image, ImageDraw
except ImportError:
    print("Gerekli paketi yükleyin: pip install Pillow")
    sys.exit(1)

# Script'in bulunduğu dizin
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

def create_icon_image(size):
    """
    İkon görselini Pillow ile oluşturur.
    SVG tasarımını Python ile yeniden çizer.
    """
    # RGBA modu ile transparan arka plan
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Merkez ve yarıçap
    center = size // 2
    radius = int(size * 0.47)  # 120/256 oranı
    
    # Gradient için katmanlar oluştur (basitleştirilmiş gradient)
    # Sol üst: #e94560, Sağ alt: #ff6b6b
    for i in range(radius, 0, -1):
        # Gradient hesapla
        t = i / radius
        r = int(233 * t + 255 * (1 - t))  # e9 -> ff
        g = int(69 * t + 107 * (1 - t))   # 45 -> 6b
        b = int(96 * t + 107 * (1 - t))   # 60 -> 6b
        color = (r, g, b, 255)
        
        # Daire çiz
        draw.ellipse(
            [center - i, center - i, center + i, center + i],
            fill=color
        )
    
    # Ok ve çizgi parametreleri
    stroke_width = max(2, int(size * 0.0625))  # 16/256 oranı
    
    # Ok koordinatları (SVG'den uyarlandı)
    arrow_top_y = int(size * 0.234)     # 60/256
    arrow_bottom_y = int(size * 0.625)  # 160/256
    arrow_tip_y = int(size * 0.656)     # 168/256
    arrow_wing_y = int(size * 0.469)    # 120/256
    arrow_left_x = int(size * 0.3125)   # 80/256
    arrow_right_x = int(size * 0.6875)  # 176/256
    
    # Dikey çizgi (ok gövdesi)
    draw.line(
        [(center, arrow_top_y), (center, arrow_bottom_y)],
        fill='white',
        width=stroke_width
    )
    
    # Ok başı - sol taraf
    draw.line(
        [(arrow_left_x, arrow_wing_y), (center, arrow_tip_y)],
        fill='white',
        width=stroke_width
    )
    
    # Ok başı - sağ taraf
    draw.line(
        [(arrow_right_x, arrow_wing_y), (center, arrow_tip_y)],
        fill='white',
        width=stroke_width
    )
    
    # Alt çizgi
    bottom_line_y = int(size * 0.765)  # 196/256
    draw.line(
        [(arrow_left_x, bottom_line_y), (arrow_right_x, bottom_line_y)],
        fill='white',
        width=stroke_width
    )
    
    # Köşeleri yuvarlamak için anti-aliasing uygula
    # (Basit bir yaklaşım - daha büyük çiz ve küçült)
    
    return img

def create_smooth_icon(size):
    """Daha pürüzsüz ikon için 4x büyütüp küçült."""
    large = create_icon_image(size * 4)
    return large.resize((size, size), Image.Resampling.LANCZOS)

def save_png(size, output_path):
    """PNG olarak kaydet."""
    img = create_smooth_icon(size)
    img.save(output_path, 'PNG')
    print(f"  ✓ {os.path.basename(output_path)} ({size}x{size})")

def create_ico(output_path):
    """Windows için ICO dosyası oluşturur."""
    sizes = [256, 128, 64, 48, 32, 16]
    images = []
    
    for size in sizes:
        img = create_smooth_icon(size)
        images.append(img)
    
    # İlk resmi (en büyük) kullanarak ICO oluştur
    images[0].save(
        output_path,
        format='ICO',
        sizes=[(img.width, img.height) for img in images]
    )
    print(f"  ✓ {os.path.basename(output_path)} (Windows)")

def create_icns_iconset(output_dir):
    """macOS için iconset klasörü oluşturur."""
    iconset_dir = os.path.join(output_dir, "icon.iconset")
    os.makedirs(iconset_dir, exist_ok=True)
    
    # macOS iconset boyutları
    sizes = [
        (16, "16x16"),
        (32, "16x16@2x"),
        (32, "32x32"),
        (64, "32x32@2x"),
        (128, "128x128"),
        (256, "128x128@2x"),
        (256, "256x256"),
        (512, "256x256@2x"),
        (512, "512x512"),
        (1024, "512x512@2x"),
    ]
    
    for size, name in sizes:
        output_path = os.path.join(iconset_dir, f"icon_{name}.png")
        save_png(size, output_path)
    
    print(f"\n  📁 icon.iconset klasörü oluşturuldu.")
    print("  ℹ️  macOS'ta ICNS oluşturmak için şu komutu çalıştırın:")
    print(f"      iconutil -c icns icon.iconset")

def main():
    print("\n🎨 Video Downloader İkon Oluşturucu")
    print("=" * 40)
    
    print(f"\n📁 Çıktı: {SCRIPT_DIR}\n")
    
    # Windows ICO
    print("🪟 Windows ikonu oluşturuluyor...")
    ico_path = os.path.join(SCRIPT_DIR, "icon.ico")
    create_ico(ico_path)
    
    # Linux PNG (256x256)
    print("\n🐧 Linux ikonu oluşturuluyor...")
    png_path = os.path.join(SCRIPT_DIR, "icon.png")
    save_png(256, png_path)
    
    # Büyük PNG (512x512) - electron-builder için
    png512_path = os.path.join(SCRIPT_DIR, "icon@2x.png")
    save_png(512, png512_path)
    
    # macOS iconset
    print("\n🍎 macOS iconset oluşturuluyor...")
    create_icns_iconset(SCRIPT_DIR)
    
    print("\n" + "=" * 40)
    print("✅ İkon oluşturma tamamlandı!")
    print("\n📋 Oluşturulan dosyalar:")
    print("   • icon.ico     - Windows")
    print("   • icon.png     - Linux (256x256)")
    print("   • icon@2x.png  - Yüksek çözünürlük (512x512)")
    print("   • icon.iconset - macOS (iconutil ile .icns'e dönüştürün)")
    print()

if __name__ == "__main__":
    main()
