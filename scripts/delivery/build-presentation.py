"""Editable submission draft PDF. No screenshots, PII or unsupported live claims."""
import json
from pathlib import Path
from xml.sax.saxutils import escape
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from pypdf import PdfReader

root = Path(__file__).resolve().parents[2]
source = json.loads((root / 'scripts/delivery/presentation.json').read_text(encoding='utf-8'))
font_candidates = [Path('C:/Windows/Fonts/arial.ttf'), Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')]
font = next((path for path in font_candidates if path.exists()), None)
if font is None:
    raise RuntimeError('Cyrillic TTF font required: Arial or DejaVu Sans')
pdfmetrics.registerFont(TTFont('Delivery', str(font)))
output = root / 'docs/submission/PRESENTATION_DRAFT.pdf'
output.parent.mkdir(parents=True, exist_ok=True)
c = canvas.Canvas(str(output), pagesize=(1280,720), invariant=1)
c.setTitle('MAX Smart City - Submission Draft')
c.setAuthor('Команда MAX Smart City')
navy = HexColor('#102B40')
blue = HexColor('#137EAD')
muted = HexColor('#4C6474')
style = ParagraphStyle('body',fontName='Delivery',fontSize=20,leading=28,textColor=navy)
small = ParagraphStyle('small',parent=style,fontSize=16,leading=23,textColor=muted)

def paragraph(text,x,y,width,custom=style):
    p = Paragraph(escape(text),custom)
    _,height = p.wrap(width,1000)
    p.drawOn(c,x,y-height)
    return height

for index,slide in enumerate(source['slides'],1):
    c.setFillColor(HexColor('#F5F8FA'));c.rect(0,0,1280,720,fill=1,stroke=0)
    c.setFillColor(blue);c.rect(0,710,1280,10,fill=1,stroke=0)
    c.setFont('Delivery',15);c.setFillColor(blue);c.drawString(58,660,slide['eyebrow'])
    heading=ParagraphStyle('heading',parent=style,fontSize=38,leading=44)
    paragraph(slide['title'],58,622,1164,heading)
    paragraph(slide['subtitle'],58,560,1150,small)
    item_font_size = 16 if index==1 else 20
    while True:
        item_style = ParagraphStyle('item',parent=style,fontSize=item_font_size,leading=item_font_size*1.35)
        totals=[]
        for column in slide['columns']:
            heights=[Paragraph(escape(item),item_style).wrap(491,1000)[1] for item in column['items']]
            totals.append(sum(heights)+len(heights)*10)
        if max(totals)<=294:
            break
        item_font_size -= 1
        if item_font_size<14:
            raise RuntimeError(f'Slide {index} requires content reduction')
    for column_index,column in enumerate(slide['columns']):
        x=58+column_index*606
        c.setFillColor(HexColor('#FFFFFF'));c.roundRect(x,126,558,379,12,fill=1,stroke=0)
        c.setFont('Delivery',24);c.setFillColor(navy);c.drawString(x+24,468,column['title'])
        y=438
        for item in column['items']:
            c.setFillColor(blue);c.circle(x+28,y-13,3,fill=1,stroke=0)
            height=paragraph(item,x+42,y,491,item_style)
            y -= height+10
        if y<130:
            raise RuntimeError(f'Content overflow on slide {index}: y={y}')
    paragraph(slide['note'],58,99,1158,small)
    c.setFont('Delivery',12);c.setFillColor(muted)
    c.drawString(58,28,source['status'])
    c.drawRightString(1222,28,f'{index} / {len(source["slides"])}')
    c.showPage()
c.save()
reader=PdfReader(str(output))
assert len(reader.pages)==6
assert 'PLACEHOLDER_SUBMISSION_SHA' in reader.pages[0].extract_text()
assert all(page.extract_text().strip() for page in reader.pages)
print(f'PDF_DRAFT PASS pages={len(reader.pages)} output={output}')
