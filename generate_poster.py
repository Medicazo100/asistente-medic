import os
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import qrcode
from qrcode.constants import ERROR_CORRECT_H
import zxingcpp

# Payload exclusivo establecido
PAYLOAD = "https://asistente-medico-20.vercel.app/"
OUTPUT_IMAGE = r"C:\Users\medic\Antigravity\public\aiclinic_cinematic_poster.png"
OUTPUT_SQUARE = r"C:\Users\medic\Antigravity\public\aiclinic_qr_square.png"
REF_LOGO_PATH = r"C:\Users\medic\Antigravity\public\media_1788790541215.jpg"  # Icono de AICLINIC

def generate_aiclinic_poster(payload=PAYLOAD, output_path=OUTPUT_IMAGE, square_path=OUTPUT_SQUARE, logo_path=REF_LOGO_PATH):
    # 1. Matriz QR con corrección de errores nivel H (30% tolerancia)
    qr = qrcode.QRCode(version=5, error_correction=ERROR_CORRECT_H, box_size=1, border=0)
    qr.add_data(payload)
    qr.make(fit=True)
    n = qr.modules_count  # 37x37
    modules = qr.modules

    # Dimensiones y Geometría
    s_mod = 32
    border_modules = 4  # Quiet zone de 4 módulos
    plate_size = (n + 2 * border_modules) * s_mod  # 1440 px
    s_off = border_modules * s_mod
    finder_locs = [(0, 0), (0, n - 7), (n - 7, 0)]
    center_module = n / 2.0
    emblem_radius_m = 4.2

    def in_finder(r, c):
        return any(fr <= r < fr + 7 and fc <= c < fc + 7 for fr, fc in finder_locs)

    def in_emblem(r, c):
        return math.hypot(r - center_module, c - center_module) <= emblem_radius_m

    # 2. Placa de cristal cyber-médico (superficie de alto contraste)
    plate = Image.new("RGBA", (plate_size, plate_size), (245, 248, 255, 255))
    plate_rad = s_mod * 1.2

    # 3. Módulos de datos orgánicos redondeados (Gris pizarra / Obsidian)
    c_slate = (18, 24, 36, 255)
    mod_rad = s_mod * 0.38
    is_dark = np.zeros((n, n), dtype=bool)
    for r in range(n):
        for c in range(n):
            if in_finder(r, c) or in_emblem(r, c):
                continue
            if modules[r][c]:
                is_dark[r, c] = True

    # Sombra de contacto de módulos
    mod_shadow = Image.new("RGBA", (plate_size, plate_size), (0, 0, 0, 0))
    ms_draw = ImageDraw.Draw(mod_shadow)
    for r in range(n):
        for c in range(n):
            if not is_dark[r, c]:
                continue
            x, y = s_off + c * s_mod + 1, s_off + r * s_mod + 2
            ms_draw.rounded_rectangle([x, y, x + s_mod, y + s_mod], radius=mod_rad, fill=(0, 0, 0, 50))
            if c + 1 < n and is_dark[r, c + 1]:
                ms_draw.rectangle([x + s_mod*0.5, y, x + s_mod*1.5, y + s_mod], fill=(0, 0, 0, 50))
            if r + 1 < n and is_dark[r + 1, c]:
                ms_draw.rectangle([x, y + s_mod*0.5, x + s_mod, y + s_mod*1.5], fill=(0, 0, 0, 50))
    plate.alpha_composite(mod_shadow.filter(ImageFilter.GaussianBlur(radius=2)))

    # Cuerpo de módulos conectados orgánicamente
    mod_layer = Image.new("RGBA", (plate_size, plate_size), (0, 0, 0, 0))
    m_draw = ImageDraw.Draw(mod_layer)
    for r in range(n):
        for c in range(n):
            if not is_dark[r, c]:
                continue
            x, y = s_off + c * s_mod, s_off + r * s_mod
            m_draw.rounded_rectangle([x, y, x + s_mod, y + s_mod], radius=mod_rad, fill=c_slate)
            if c + 1 < n and is_dark[r, c + 1]:
                m_draw.rectangle([x + s_mod*0.5, y, x + s_mod*1.5, y + s_mod], fill=c_slate)
            if r + 1 < n and is_dark[r + 1, c]:
                m_draw.rectangle([x, y + s_mod*0.5, x + s_mod, y + s_mod*1.5], fill=c_slate)
    plate.alpha_composite(mod_layer)

    # 4. Patrones de esquina 3D (Cruz metálica + Línea ECG cian neón)
    finder_layer = Image.new("RGBA", (plate_size, plate_size), (0, 0, 0, 0))
    fl_draw = ImageDraw.Draw(finder_layer)
    for fr, fc in finder_locs:
        fx, fy = s_off + fc * s_mod, s_off + fr * s_mod
        fw = fh = 7 * s_mod
        # Marco 7x7
        fl_draw.rounded_rectangle([fx, fy, fx + fw, fy + fh], radius=s_mod * 1.2, fill=c_slate, outline=(205, 220, 238, 240), width=2)
        # Espacio claro 5x5
        fl_draw.rounded_rectangle([fx + s_mod, fy + s_mod, fx + fw - s_mod, fy + fh - s_mod], radius=s_mod * 0.8, fill=(245, 248, 255, 255))
        # Núcleo 3x3
        cx, cy = fx + 2 * s_mod, fy + 2 * s_mod
        cw = 3 * s_mod
        mid_x, mid_y = cx + cw / 2.0, cy + cw / 2.0
        fl_draw.rounded_rectangle([cx, cy, cx + cw, cy + cw], radius=s_mod * 0.45, fill=(16, 22, 32, 255))
        # Cruz médica plateada
        arm, clen = s_mod * 0.40, s_mod * 1.10
        fl_draw.rounded_rectangle([mid_x - arm, mid_y - clen, mid_x + arm, mid_y + clen], radius=s_mod*0.1, outline=(180, 205, 230, 70), width=2)
        fl_draw.rounded_rectangle([mid_x - clen, mid_y - arm, mid_x + clen, mid_y + arm], radius=s_mod*0.1, outline=(180, 205, 230, 70), width=2)
        # Línea de pulso ECG horizontal
        pts = [(cx + 10, mid_y), (mid_x - 14, mid_y), (mid_x - 5, mid_y - 18), (mid_x + 5, mid_y + 18), (mid_x + 14, mid_y), (cx + cw - 10, mid_y)]
        fl_draw.line(pts, fill=(0, 245, 230, 85), width=2)
    plate.alpha_composite(finder_layer)

    # 5. Emblema central flotante (Badge de cristal + Logo AICLINIC)
    cx_center, cy_center = plate_size // 2, plate_size // 2
    badge_rad = int(4.0 * s_mod)
    badge_layer = Image.new("RGBA", (plate_size, plate_size), (0, 0, 0, 0))
    bl_draw = ImageDraw.Draw(badge_layer)
    bl_draw.ellipse([cx_center - badge_rad, cy_center - badge_rad, cx_center + badge_rad, cy_center + badge_rad], fill=(12, 68, 92, 255), outline=(210, 225, 240, 255), width=4)
    plate.alpha_composite(badge_layer)

    if logo_path and os.path.exists(logo_path):
        ref_img = Image.open(logo_path).convert("RGBA")
        rw, rh = ref_img.size
        sq = min(rw, rh)
        ref_sq = ref_img.crop(((rw - sq)//2, (rh - sq)//2, (rw + sq)//2, (rh + sq)//2))
        diam = int(badge_rad * 1.85)
        ref_resized = ref_sq.resize((diam, diam), Image.Resampling.LANCZOS)
        c_mask = Image.new("L", (diam, diam), 0)
        ImageDraw.Draw(c_mask).ellipse([0, 0, diam, diam], fill=255)
        plate.paste(ref_resized, (cx_center - diam//2, cy_center - diam//2), c_mask)

    # Save high-contrast square asset as well
    if square_path:
        pad_px = s_mod * 2
        sq_padded = Image.new("RGB", (plate_size + pad_px * 2, plate_size + pad_px * 2), (245, 248, 255))
        sq_padded.paste(plate.convert("RGB"), (pad_px, pad_px))
        sq_padded.save(square_path, "PNG", quality=100)
        print(f"[OK] Square QR Guardado en: {square_path}")

    # 6. Poster Cinematográfico (2000 x 2000 px)
    canvas_size = 2000
    y_grid, x_grid = np.mgrid[0:canvas_size, 0:canvas_size]
    nx, ny = x_grid / float(canvas_size), y_grid / float(canvas_size)
    c_navy = np.array([7, 11, 28], dtype=np.float32)
    c_purple = np.array([36, 10, 58], dtype=np.float32)
    c_magenta = np.array([215, 20, 128], dtype=np.float32)
    c_cyan = np.array([0, 235, 220], dtype=np.float32)

    diag = nx * 0.7 + ny * 0.3
    base_bg = (1.0 - diag)[:, :, None] * c_navy + diag[:, :, None] * c_purple
    base_bg += np.exp(-np.sqrt((nx - 1.0)**2 + (ny - 1.0)**2) * 2.2)[:, :, None] * c_magenta * 0.85
    base_bg += np.exp(-np.sqrt((nx - 0.0)**2 + (ny - 0.0)**2) * 2.5)[:, :, None] * c_cyan * 0.45

    poster = Image.fromarray(np.clip(base_bg, 0, 255).astype(np.uint8), "RGB").convert("RGBA")
    px = py = (canvas_size - plate_size) // 2

    # Resplandor neón e inserción de la placa
    neon_rim = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    ImageDraw.Draw(neon_rim).rounded_rectangle([px - 6, py - 6, px + plate_size + 6, py + plate_size + 6], radius=int(plate_rad + 6), outline=(225, 25, 135, 190), width=8)
    poster.alpha_composite(neon_rim.filter(ImageFilter.GaussianBlur(radius=18)))
    poster.paste(plate, (px, py), plate)

    # Tipografía oficial con la URL establecida
    t_draw = ImageDraw.Draw(poster)
    t_draw.text((canvas_size // 2, py - 95), "AICLINIC", fill=(255, 255, 255, 255), anchor="mm", font_size=54)
    t_draw.text((canvas_size // 2, py - 52), "ASISTENTE MEDICO AI // 3D SECURE GATEWAY", fill=(0, 240, 225, 220), anchor="mm", font_size=18)
    t_draw.text((canvas_size // 2, py + plate_size + 65), "100% SCANNABLE 3D QR CODE • INSTANT SMARTPHONE CAMERA VERIFIED", fill=(255, 255, 255, 225), anchor="mm", font_size=18)
    t_draw.text((canvas_size // 2, py + plate_size + 102), f"PORTAL MEDICO OFICIAL • {payload.upper()}", fill=(225, 60, 160, 210), anchor="mm", font_size=16)

    poster.convert("RGB").save(output_path, "PNG", quality=100)
    print(f"[OK] Guardado exitosamente en: {output_path}")

    # 7. Verificación Óptica con ZXing
    print("\n=== VERIFICACIÓN ÓPTICA INMEDIATA ===")
    res_poster = zxingcpp.read_barcodes(Image.open(output_path))
    if res_poster:
        print(f"Poster: DETECTADO -> {res_poster[0].text} ({res_poster[0].format})")
        assert res_poster[0].text == payload, f"Mismatch in poster: {res_poster[0].text} != {payload}"
    else:
        print("Poster: ERROR - no se detectó código QR")

    if square_path and os.path.exists(square_path):
        res_sq = zxingcpp.read_barcodes(Image.open(square_path))
        if res_sq:
            print(f"Square: DETECTADO -> {res_sq[0].text} ({res_sq[0].format})")
            assert res_sq[0].text == payload, f"Mismatch in square: {res_sq[0].text} != {payload}"
        else:
            print("Square: ERROR - no se detectó código QR")

if __name__ == "__main__":
    generate_aiclinic_poster()
