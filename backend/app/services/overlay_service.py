from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from .storage import project_dir


try:
    DEFAULT_FONT = ImageFont.truetype("DejaVuSans.ttf", 44)
    SMALL_FONT = ImageFont.truetype("DejaVuSans.ttf", 28)
except Exception:
    DEFAULT_FONT = ImageFont.load_default()
    SMALL_FONT = ImageFont.load_default()


def render_card_mock(project_id: str, decade: str, state: dict) -> str:
    pdir = project_dir(project_id)
    output = pdir / "cards" / f"{project_id}_{decade}_card.png"
    img = Image.new("RGB", (1920, 1080), (20, 28, 42))
    draw = ImageDraw.Draw(img)
    draw.rectangle((0, 0, 1920, 150), fill=(0, 48, 80))
    surname = state["person"]["surname"].upper()
    position = state["person"]["position"]
    school_years = state["person"]["school_years"]
    draw.text((64, 36), surname, font=DEFAULT_FONT, fill=(255, 255, 255))
    draw.text((64, 88), position, font=SMALL_FONT, fill=(220, 230, 240))
    draw.text((1640, 52), decade, font=DEFAULT_FONT, fill=(255, 255, 255))
    draw.text((64, 1000), school_years, font=SMALL_FONT, fill=(220, 230, 240))
    draw.text((64, 220), "PLACEHOLDER CARD — replace center image after image provider generation", font=SMALL_FONT, fill=(180, 190, 200))
    img.save(output)
    return str(output)
