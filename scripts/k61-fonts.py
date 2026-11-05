# KICKER 6.1: build the one typeface. Fraunces (OFL, github.com/undercasetype/Fraunces) variable TTF in, out:
#   public/fonts/fraunces-k.woff2 (opsz 9-144, wght 300-800, SOFT 50, WONK 1, Latin subset) and the static cuts for
#   resvg in api/_fonts and scripts/_fonts.   python scripts/k61-fonts.py <Fraunces[SOFT,WONK,opsz,wght].ttf>
import sys, shutil
SRC = sys.argv[1]
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset
UNI = "U+0020-007E,U+00A0,U+00B7,U+00D7,U+2013,U+2014,U+2018,U+2019,U+201C,U+201D,U+2026,U+2022"
def sub(font, out, flavor=None):
    opts = subset.Options()
    opts.flavor = flavor
    opts.layout_features = ["kern","liga","calt","tnum","lnum","pnum","onum","case","rvrn","ss01","ss02"]
    opts.name_IDs = ["*"]; opts.notdef_outline = True; opts.hinting = False
    s = subset.Subsetter(opts); s.populate(unicodes=subset.parse_unicodes(UNI)); s.subset(font)
    font.flavor = flavor; font.save(out)
# web: variable in opsz + wght, SOFT and WONK pinned
f = TTFont(SRC)
v = instancer.instantiateVariableFont(f, {"SOFT": 50, "WONK": 1, "wght": (300, 800)})
sub(v, "fraunces-k.woff2", "woff2")
def setname(font, fam, sub_, weight):
    n = font["name"]
    for rec in list(n.names):
        if rec.nameID in (1,2,4,6,16,17,21,22,25): n.removeNames(nameID=rec.nameID)
    n.setName(fam, 1, 3, 1, 0x409); n.setName(sub_, 2, 3, 1, 0x409)
    n.setName(f"{fam} {sub_}", 4, 3, 1, 0x409); n.setName((fam+"-"+sub_).replace(" ",""), 6, 3, 1, 0x409)
    font["OS/2"].usWeightClass = weight
    font["OS/2"].fsSelection = (font["OS/2"].fsSelection & ~0b1100001) | (0b1000000 if weight==400 else 0)
for opsz, wght, fam, fn in [(144,600,"Fraunces Display","FrauncesDisplay-600"),(144,400,"Fraunces Display","FrauncesDisplay-400"),(24,400,"Fraunces Text","FrauncesText-400"),(24,600,"Fraunces Text","FrauncesText-600")]:
    f = TTFont(SRC)
    s = instancer.instantiateVariableFont(f, {"SOFT": 50, "WONK": 1, "wght": wght, "opsz": opsz}, updateFontNames=False)
    setname(s, fam, "Regular" if wght==400 else "SemiBold", wght)
    sub(s, fn + ".ttf")
shutil.move("fraunces-k.woff2", "public/fonts/fraunces-k.woff2")
for n in ["FrauncesDisplay-400","FrauncesDisplay-600","FrauncesText-400","FrauncesText-600"]:
    shutil.copy(n + ".ttf", "scripts/_fonts/"); shutil.move(n + ".ttf", "api/_fonts/" + n + ".ttf")
