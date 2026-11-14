#!/usr/bin/env python3
"""Собирает docs/index.html из docs/model.md для GitHub Pages.
Запуск: python3 docs/build.py  (нужен пакет markdown: pip install markdown)
Формулы из блоков ```math рисует KaTeX в браузере."""
import html, pathlib, re
import markdown

here = pathlib.Path(__file__).resolve().parent
src = (here / 'model.md').read_text(encoding='utf-8')

# блоки ```math -> <div class="math">\[ … \]</div>
def math_block(m):
    return '\n<div class="math">\\[' + html.escape(m.group(1).strip(), quote=False) + '\\]</div>\n'
src = re.sub(r'```math\n(.*?)\n```', math_block, src, flags=re.S)

body = markdown.markdown(src, extensions=['tables', 'fenced_code', 'toc'], extension_configs={'toc': {'toc_depth': '2-2'}}, output_format='html5')
title = re.search(r'^# (.+)$', src, flags=re.M).group(1)
toc = markdown.Markdown(extensions=['toc'], extension_configs={'toc': {'toc_depth': '2-2'}})
toc.convert(src)

page = f'''<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.css">
<style>
:root {{ --bg: #fbfaf8; --fg: #1f1e1c; --muted: #6b6862; --line: #e4e1db; --accent: #2a6fd6; --code: #f1efea; }}
@media (prefers-color-scheme: dark) {{ :root {{ --bg: #1b1a18; --fg: #ecebe8; --muted: #a29f98; --line: #34322e; --accent: #7aa7ff; --code: #26241f; }}
  img {{ background: #fff; border-radius: 6px; }} }}
* {{ box-sizing: border-box; }}
body {{ margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.6 -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }}
.wrap {{ max-width: 860px; margin: 0 auto; padding: 32px 16px 80px; }}
nav.top {{ display: flex; gap: 16px; flex-wrap: wrap; font-size: 14px; margin-bottom: 24px; }}
nav.top a {{ color: var(--accent); text-decoration: none; }}
h1 {{ font-size: 30px; line-height: 1.25; margin: 0 0 16px; }}
h2 {{ font-size: 23px; margin: 48px 0 12px; padding-top: 8px; border-top: 1px solid var(--line); }}
h3 {{ font-size: 18px; margin: 28px 0 8px; }}
a {{ color: var(--accent); overflow-wrap: anywhere; }}
img {{ max-width: 100%; height: auto; display: block; margin: 16px 0 4px; }}
table {{ border-collapse: collapse; width: 100%; margin: 16px 0; font-size: 14px; display: block; overflow-x: auto; }}
th, td {{ border: 1px solid var(--line); padding: 6px 10px; text-align: left; vertical-align: top; }}
th {{ background: var(--code); }}
code {{ background: var(--code); padding: 1px 5px; border-radius: 4px; font-size: 0.9em; }}
pre {{ background: var(--code); padding: 12px 14px; border-radius: 6px; overflow-x: auto; }}
pre code {{ background: none; padding: 0; }}
.math {{ overflow-x: auto; margin: 16px 0; }}
details.toc {{ margin: 0 0 24px; padding: 12px 16px; border: 1px solid var(--line); border-radius: 8px; }}
details.toc summary {{ cursor: pointer; font-weight: 600; }}
details.toc ul {{ margin: 8px 0 0; padding-left: 20px; }}
</style>
</head>
<body>
<div class="wrap">
<nav class="top"><a href="../">Главная</a><a href="../calc/">Калькулятор</a><a href="../demo/">Демо колеса</a><a href="model.pdf">PDF</a></nav>
{body.split('</h1>', 1)[0]}</h1>
<details class="toc"><summary>Содержание</summary>{toc.toc}</details>
{body.split('</h1>', 1)[1]}
</div>
<script defer src="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.js"></script>
<script defer src="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/contrib/auto-render.min.js"
  onload="renderMathInElement(document.body, {{ delimiters: [{{ left: '\\\\[', right: '\\\\]', display: true }}], throwOnError: false }});"></script>
</body>
</html>
'''
(here / 'index.html').write_text(page, encoding='utf-8')
print('built docs/index.html')
