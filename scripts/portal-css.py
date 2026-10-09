"""Gera app/_portal/portal.css a partir do design system do portal (design/portal/).

Uso: python3 scripts/portal-css.py
O bundle.css do design system foi escrito para pranchetas de largura fixa (.dia-m e .dia-desk) e com
regras globais. Aqui ele vira um arquivo que convive com o painel: tudo fica dentro de .dia-screen e
as regras de desktop valem pela largura do próprio portal (container query), não da janela.
"""
import re, json, os
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
src = open(os.path.join(root, "design/portal/bundle.css")).read()
tokens = json.load(open(os.path.join(root, "design/portal/tokens.json")))
out_path = os.path.join(root, "app/_portal/portal.css")

# 1. tira o @import das fontes (entram por next/font) e as regras globais
assert src.startswith('@import'); src = src.split('\n', 1)[1]
src = re.sub(r'\n\* \{ box-sizing: border-box; \}\nhtml, body \{ margin: 0; \}\nbody \{.*?\n\}\n\[data-theme\] \{ color: var\(--ink\); \}\n', '\n', src, flags=re.S)
src = src.replace(':root {', '.dia-screen {', 1)
# 2. larguras fixas das pranchetas
src = re.sub(r'\n\.dia-m \{[^}]*\}', '', src)
src = re.sub(r'\n\.dia-desk \{[^}]*\}', '', src)
# 3. linha de tabela do desktop: o portal usa a mesma linha compacta nos dois tamanhos
src = re.sub(r'\n\.dia-desk \.dia-row[^\n]*', '', src)
# 4. ilustrações de exemplo das pranchetas
src = re.sub(r'\n\.mock[^{}]*\{[^}]*\}', '', src)
# 5. auxiliares que só servem às pranchetas do design system
src = src.split('/* ---------- auxiliares de documentação')[0].rstrip() + '\n'
src = src.replace('  *, *::before, *::after { animation-duration', '  .dia-screen *, .dia-screen *::before, .dia-screen *::after { animation-duration')

def fix_selector(sel):
    s = sel.strip()
    if not s: return []
    if '.dia-' not in s: return ['.dia-screen ' + s]
    if s.startswith('[data-theme="light"]'): return []           # o claro só existe como .dia-light
    if '.mock' in s: return ['.dia-screen ' + s]
    if s.startswith('.dia-screen'): return [s]
    if s.startswith('.dia-light '): s = s[len('.dia-light '):]; root = '.dia-screen.dia-light'
    else: root = '.dia-screen'
    m = re.match(r'(\.dia-grain)(.*)$', s)
    if m and not m.group(2).startswith(('-', '_')):
        return [f'{root}{s}', f'{root} {s}']                      # textura na própria raiz ou dentro dela
    return [f'{root} {s}']

def rule(m):
    head = m.group(1)
    cut = head.rfind('*/')
    pre, sel = (head[:cut+2], head[cut+2:]) if cut >= 0 else ('', head)
    lead = re.match(r'\s*', sel).group(0)
    body = sel.strip()
    if body.startswith('@') or '.dia-' not in body: return m.group(0)
    desk = body.startswith('.dia-desk ')
    parts = []
    for p in body.split(','):
        p = p.strip()
        if p.startswith('.dia-desk '): p = p[len('.dia-desk '):]
        parts += fix_selector(p)
    if not parts: parts = ['.dia-screen .dia-never']
    text = ', '.join(parts)
    return f'{pre}{lead}{"@@DESK@@" if desk else ""}{text} {{'

css = re.sub(r'([^{}]+)\{', rule, src)
# regras de desktop viram media query (cada uma numa linha só no original)
css = re.sub(r'@@DESK@@([^{\n]+\{[^}\n]*\})', r'@container dia (min-width: 900px) { \1 }', css)
assert '@@DESK@@' not in css, 'regra de desktop com mais de uma linha'

def decl(theme):
    lines = []
    for t in tokens['color']['tokens']:
        v = t['value']; lines.append(f"  --{t['name']}: {v[theme] if isinstance(v, dict) else v};")
    for t in tokens['shadow']['tokens']:
        v = t['value']
        if isinstance(v, dict): lines.append(f"  --{t['name']}: {v[theme]};")
    return '\n'.join(lines)

fam = tokens['type']['families']
head = f"""/*
 * Portal de materiais: páginas públicas (/m/...) e a pré-visualização do editor.
 * GERADO por scripts/portal-css.py a partir do design system "d.ia.riamente — Portal de materiais"
 * (design/portal/). Não edite à mão. Raiz: <div class="dia-screen dia-grain"> com as fontes de app/_portal/fonts.ts.
 * O escuro é a identidade e vale para todo visitante; o claro existe como .dia-light, ainda sem uso.
 * As composições de tela (grades, margens por largura) ficam em app/_portal/layout.css, escrito à mão.
 */

.dia-screen {{
{decl('dark')}
  --font-display: var(--dia-font-display), {fam['display'].split(',', 1)[1].strip()};
  --font-sans: var(--dia-font-sans), {fam['sans'].split(',', 1)[1].strip()};
  --font-mono: var(--dia-font-mono), {fam['mono'].split(',', 1)[1].strip()};
  font-family: var(--font-sans);
  font-size: 16px;
  line-height: 25px;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}}
.dia-screen.dia-light {{
{decl('light')}
}}
.dia-screen, .dia-screen *, .dia-screen *::before, .dia-screen *::after {{ box-sizing: border-box; }}
"""
open(out_path, 'w').write(head + css.lstrip('\n'))
print(len(css), 'bytes')
