"""Build the heading-font subset: Fixel Display (wdth 100), wght 600-700,
same code points as the previous Literata file plus NBSP, soft hyphen and U+02BC."""
import sys
from fontTools.ttLib import TTFont
from fontTools import subset
from fontTools.varLib import instancer
src, ref, dst = sys.argv[1:4]
cps = set(TTFont(ref).getBestCmap())
f = instancer.instantiateVariableFont(TTFont(src), {'wght': (600, 700), 'wdth': 100})
for t in f['cmap'].tables:
    if t.isUnicode():
        t.cmap[0xA0] = t.cmap[0x20]      # NBSP -> space
        t.cmap[0xAD] = t.cmap[0x2D]      # soft hyphen -> hyphen
        t.cmap[0x2BC] = t.cmap[0x2019]   # modifier apostrophe -> right single quote
cps |= {0xA0, 0xAD, 0x2BC}
name = f['name']
for pid, eid, lid in ((3, 1, 0x409), (1, 0, 0)):
    name.setName('Copyright (c) 2023 MacPaw Way Ltd. (https://macpaw.com)', 0, pid, eid, lid)
    name.setName('This Font Software is licensed under the SIL Open Font License, Version 1.1.', 13, pid, eid, lid)
    name.setName('https://openfontlicense.org', 14, pid, eid, lid)
o = subset.Options(); o.flavor = 'woff2'; o.name_IDs = ['*']; o.notdef_outline = True
o.layout_features = ['kern', 'liga', 'calt', 'ccmp', 'locl', 'mark', 'mkmk', 'case']
s = subset.Subsetter(o); s.populate(unicodes=cps); s.subset(f)
subset.save_font(f, dst, o)
cm = TTFont(dst).getBestCmap()
print(dst, 'missing:', [hex(c) for c in sorted(cps) if c not in cm])
