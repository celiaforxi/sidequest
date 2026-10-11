"""Bundle our own native modules and local asset into a double-clickable HTML file."""
from pathlib import Path
import base64
import re

root = Path(__file__).resolve().parent
dist = root / 'dist'
html = (dist / 'index.html').read_text()
css = (dist / 'styles.css').read_text()
photo = base64.b64encode((dist / 'assets/paris.svg').read_bytes()).decode()
css = css.replace("./assets/paris.svg", f'data:image/svg+xml;base64,{photo}')
scripts = []
for name in ('data.mjs', 'intent.mjs', 'planner.mjs', 'api.mjs', 'app.mjs'):
    script = (dist / name).read_text()
    script = re.sub(r'^import .*?;\n', '', script, flags=re.M)
    script = re.sub(r'\bexport (?=(const|function|async)\b)', '', script)
    scripts.append(script)
js = '\n'.join(scripts).replace('</script', '<\\/script')
html = html.replace('<link rel="stylesheet" href="./styles.css">', f'<style>{css}</style>')
html = html.replace('<script type="module" src="./app.mjs?v=4"></script>', '')
html = html.replace('</body>', f'<script type="module">{js}</script></body>')
(root / 'SideQuest.html').write_text(html)
print('Created SideQuest.html — all assets included, no server or dependency required.')
