# Документ с моделью

- `model.md` — документ с математикой и графиками; читается прямо на GitHub.
- `index.html` — тот же документ страницей для GitHub Pages: https://devmtsarev.github.io/wheel/docs/
- `model.pdf` — тот же документ в PDF, выгружен из Claude Docs.
- `img/` — графики из документа (PNG).
- `build.py` — собирает `index.html` из `model.md`: `python3 docs/build.py` (нужен `pip install markdown`). Запускать после каждого изменения `model.md`.

Формулы и контрольные числа берутся из `../calc/model.js`. Графики статичные; интерактивный вариант — калькулятор, ссылки на него стоят под графиками.
