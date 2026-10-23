"""Gera os ícones do app do celular com o mesmo cubo "J" do Journal do PC.

Lê o desenho original do programa do PC (bloco-de-notas-2/icone-journal.jpg) e põe o cubo
sobre um fundo branco, como o ícone do Notion no Android.
Uso: python gerar_icone.py   (depois aumente VERSAO no sw.js)
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

aqui = Path(__file__).parent
origem = aqui / "../../../2026.10.03 Bloco de Notas/01 Projeto/bloco-de-notas-2/icone-journal.jpg"
img = Image.open(origem).convert("L")

# Mesmo recorte do PC: o branco de fora vira transparente, o de dentro do cubo fica.
claro = img.point(lambda v: 255 if v > 128 else 0)
for canto in [(0, 0), (claro.width - 1, 0), (0, claro.height - 1), (claro.width - 1, claro.height - 1)]:
    if claro.getpixel(canto) == 255:
        ImageDraw.floodfill(claro, canto, 128)
fora = claro.point(lambda v: 255 if v == 128 else 0).filter(ImageFilter.MaxFilter(3))
cubo = Image.merge("RGBA", (img, img, img, fora.point(lambda v: 255 - v)))
cubo = cubo.crop(cubo.getchannel("A").getbbox())


def icone(lado, ocupa, arredondado):
    """Cubo centralizado num quadrado branco; 'ocupa' é a fração do lado que o cubo usa."""
    fundo = Image.new("RGBA", (lado, lado), (0, 0, 0, 0))
    mascara = Image.new("L", (lado, lado), 0)
    raio = int(lado * 0.22) if arredondado else 0
    ImageDraw.Draw(mascara).rounded_rectangle([0, 0, lado - 1, lado - 1], radius=raio, fill=255)
    fundo.paste((255, 255, 255, 255), (0, 0), mascara)
    k = lado * ocupa / max(cubo.size)
    c = cubo.resize((round(cubo.width * k), round(cubo.height * k)), Image.LANCZOS)
    fundo.alpha_composite(c, ((lado - c.width) // 2, (lado - c.height) // 2))
    return fundo


pasta = aqui / "icons"
icone(192, 0.68, True).save(pasta / "icon-192.png")
icone(512, 0.68, True).save(pasta / "icon-512.png")
# "maskable": o Android corta em círculo ou gota, então o cubo fica dentro da área segura (80% do meio)
icone(512, 0.56, False).save(pasta / "icon-maskable-512.png")
print("ícones gerados em icons/")
