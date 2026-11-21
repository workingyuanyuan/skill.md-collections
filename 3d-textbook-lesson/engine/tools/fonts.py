# 字型子集化：收集 src 內所有字元，產生 fonts.js（woff2 base64）並檢查缺字
# 環境變數 FONT_DIR：含 NotoSerifTC-VF.ttf、NotoSansTC-VF.ttf、LXGWWenKaiTC-Medium.ttf
import os, re, glob, base64, io, sys
from fontTools.ttLib import TTFont
from fontTools import subset
from fontTools.varLib import instancer

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
fd = os.environ.get('FONT_DIR')
NEED = ['NotoSerifTC-VF.ttf', 'NotoSansTC-VF.ttf', 'LXGWWenKaiTC-Medium.ttf']
lost = NEED if not fd else [f for f in NEED if not os.path.exists(os.path.join(fd, f))]
if lost:
    print('請把環境變數 FONT_DIR 設成放字型的資料夾，裡面要有：' + '、'.join(lost))
    sys.exit(1)
chars = set(chr(c) for c in range(0x20, 0x7f))
chars |= set('　，。、；：？！（）「」『』【】〈〉《》〔〕…％‧·・－—–～∕／＋＝＊＃＠＆＜＞｜＿￣→←↑↓▲▼▶◀★☆●○◎◆◇■□✓⊕♣ⓘ①②③④⑤⑥⑦⑧⑨⑩’‘“”×÷±≈≠≤≥∞')
used = set()
for f in glob.glob(os.path.join(root, 'src', '**', '*.js'), recursive=True):
    s = open(f, encoding='utf-8').read()
    used |= set(ch for ch in s if ord(ch) > 0x7f)
chars |= used
chars = sorted(c for c in chars if c.isprintable() or c == '　')
text = ''.join(chars)

def build(path, wght=None):
    f = TTFont(path)
    if wght is not None and 'fvar' in f:
        f = instancer.instantiateVariableFont(f, {'wght': wght})
    cmap = f.getBestCmap()
    missing = [c for c in chars if ord(c) not in cmap and not c.isspace() and ord(c) not in (0x9fff, 0xf900)]
    opt = subset.Options(); opt.flavor = 'woff2'; opt.layout_features = ['*']; opt.name_IDs = ['*']; opt.notdef_outline = True
    s = subset.Subsetter(opt); s.populate(text=text); s.subset(f)
    b = io.BytesIO(); f.flavor = 'woff2'; f.save(b)
    return base64.b64encode(b.getvalue()).decode(), missing

out = {}
report = {}
for key, fn, w in [('serif400', 'NotoSerifTC-VF.ttf', 400), ('serif700', 'NotoSerifTC-VF.ttf', 700), ('sans400', 'NotoSansTC-VF.ttf', 400), ('sans700', 'NotoSansTC-VF.ttf', 700), ('kai', 'LXGWWenKaiTC-Medium.ttf', None)]:
    out[key], miss = build(os.path.join(fd, fn), w)
    report[key] = miss
with open(os.path.join(root, 'fonts.js'), 'w', encoding='utf-8') as fh:
    fh.write('/* Noto Serif TC、Noto Sans TC、LXGW WenKai TC 子集（SIL Open Font License 1.1） */\nwindow.__FONTS={' + ','.join(f'{k}:"{v}"' for k, v in out.items()) + '};\n')
print('fonts.js', round(os.path.getsize(os.path.join(root, 'fonts.js')) / 1024), 'KB;', len(chars), 'chars')
for k, m in report.items():
    if m: print('缺字', k, ''.join(m))
# 原始碼用到、但有任何一套內嵌字型沒有的字：那套字型畫到它時，瀏覽器會改用系統字型，換電腦後可能變成方框。
# 寫進 fonts-report.json，由 tools/check.mjs 判定為未通過。
import json
none = sorted(set.union(*[set(m) for m in report.values()]) & used)
json.dump({'chars': len(chars), 'missing_everywhere': ''.join(none), 'missing': {k: ''.join(m) for k, m in report.items()}},
          open(os.path.join(root, 'fonts-report.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
if none:
    print('有內嵌字型沒有這些字，請換成每套字型都有的字或改用向量圖示：', ''.join(none))
