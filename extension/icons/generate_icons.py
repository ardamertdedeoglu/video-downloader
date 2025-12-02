"""
Simple script to generate extension icons
Run this script to create icon PNG files
"""
import base64
import struct
import zlib

def create_png_icon(size, filename):
    """
    Creates a simple gradient PNG icon with a download arrow
    """
    # Create image data (RGBA)
    pixels = []
    center_x, center_y = size // 2, size // 2
    
    for y in range(size):
        row = []
        for x in range(size):
            # Gradient background (purple to blue)
            r = int(102 + (y / size) * 20)  # 102 -> 122
            g = int(126 - (y / size) * 30)  # 126 -> 96
            b = int(234 - (y / size) * 40)  # 234 -> 194
            
            # Circular mask for rounded corners
            dist_from_center = ((x - center_x) ** 2 + (y - center_y) ** 2) ** 0.5
            corner_radius = size * 0.15
            max_dist = (size // 2) - corner_radius
            
            # Check if pixel is in the rounded corner area
            in_corner = False
            corners = [
                (corner_radius, corner_radius),
                (size - corner_radius - 1, corner_radius),
                (corner_radius, size - corner_radius - 1),
                (size - corner_radius - 1, size - corner_radius - 1)
            ]
            
            for cx, cy in corners:
                if ((x < corner_radius and y < corner_radius) or
                    (x > size - corner_radius - 1 and y < corner_radius) or
                    (x < corner_radius and y > size - corner_radius - 1) or
                    (x > size - corner_radius - 1 and y > size - corner_radius - 1)):
                    corner_dist = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
                    if corner_dist > corner_radius:
                        in_corner = True
                        break
            
            if in_corner:
                a = 0  # Transparent
            else:
                a = 255  # Opaque
                
                # Draw download arrow icon
                arrow_size = size * 0.5
                arrow_x = center_x
                arrow_y = center_y
                
                # Arrow body (vertical line)
                body_width = size * 0.12
                body_top = center_y - arrow_size * 0.4
                body_bottom = center_y + arrow_size * 0.2
                
                if (abs(x - arrow_x) < body_width / 2 and 
                    body_top < y < body_bottom):
                    r, g, b = 255, 255, 255
                
                # Arrow head (triangle)
                head_top = center_y + arrow_size * 0.05
                head_bottom = center_y + arrow_size * 0.4
                head_width = size * 0.35
                
                if head_top < y < head_bottom:
                    progress = (y - head_top) / (head_bottom - head_top)
                    half_width = head_width * (1 - progress) / 2
                    if abs(x - arrow_x) < half_width:
                        r, g, b = 255, 255, 255
                
                # Download bar at bottom
                bar_top = center_y + arrow_size * 0.45
                bar_bottom = center_y + arrow_size * 0.55
                bar_width = size * 0.45
                
                if (bar_top < y < bar_bottom and 
                    abs(x - arrow_x) < bar_width / 2):
                    r, g, b = 255, 255, 255
            
            row.extend([r, g, b, a])
        pixels.append(bytes(row))
    
    # Create PNG
    def png_chunk(chunk_type, data):
        chunk_len = struct.pack('>I', len(data))
        chunk_data = chunk_type + data
        checksum = struct.pack('>I', zlib.crc32(chunk_data) & 0xffffffff)
        return chunk_len + chunk_data + checksum
    
    # PNG signature
    png_signature = b'\x89PNG\r\n\x1a\n'
    
    # IHDR chunk
    ihdr_data = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    ihdr = png_chunk(b'IHDR', ihdr_data)
    
    # IDAT chunk (image data)
    raw_data = b''
    for row in pixels:
        raw_data += b'\x00' + row  # Filter byte (0 = None) + row data
    
    compressed = zlib.compress(raw_data, 9)
    idat = png_chunk(b'IDAT', compressed)
    
    # IEND chunk
    iend = png_chunk(b'IEND', b'')
    
    # Write PNG
    with open(filename, 'wb') as f:
        f.write(png_signature + ihdr + idat + iend)
    
    print(f"Created {filename}")

# Generate all icon sizes
if __name__ == "__main__":
    create_png_icon(16, "icon16.png")
    create_png_icon(48, "icon48.png")
    create_png_icon(128, "icon128.png")
    print("All icons created!")
