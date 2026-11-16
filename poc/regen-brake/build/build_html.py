"""src/* + build/*.json → index.html (단독 실행용 전체 문서) 와 build/artifact.html (Artifact 게시용 본문).

Usage: python3 build/build_html.py   (prepare.py, node build/check.js 실행 후)
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC, BUILD = ROOT / "src", ROOT / "build"


def js_json(path: Path) -> str:
    return path.read_text(encoding="utf-8").replace("</", "<\\/")


html = (SRC / "template.html").read_text(encoding="utf-8")
parts = {
    "/*__CSS__*/": (SRC / "style.css").read_text(encoding="utf-8"),
    "/*__MODEL__*/": js_json(BUILD / "model.json"),
    "/*__TS__*/": js_json(BUILD / "ts.json"),
    "/*__SIMVALID__*/": js_json(BUILD / "sim_valid.json"),
    "/*__CORE__*/": (SRC / "core.js").read_text(encoding="utf-8"),
    "/*__I18N__*/": (SRC / "i18n.js").read_text(encoding="utf-8"),
    "/*__APP__*/": (SRC / "app.js").read_text(encoding="utf-8"),
}
for k, v in parts.items():
    assert k in html, k
    html = html.replace(k, v)

(BUILD / "artifact.html").write_text(html, encoding="utf-8")
full = ('<!doctype html>\n<html lang="ko">\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' + html + "\n</html>\n")
(ROOT / "index.html").write_text(full, encoding="utf-8")
print(f"[build] index.html {len(full.encode()) / 1e6:.2f} MB")
