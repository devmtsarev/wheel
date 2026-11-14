# Колесо призов

Виджет «колесо призов» для вебкам-платформы: демо виджета, модель цены вращения с документом и калькулятор.

## Страницы

| Что | Ссылка |
| --- | --- |
| Демо колеса | https://devmtsarev.github.io/wheel/demo/ |
| Документ с моделью цены | https://devmtsarev.github.io/wheel/docs/ |
| Документ в PDF | https://devmtsarev.github.io/wheel/docs/model.pdf |
| Калькулятор цены вращения | https://devmtsarev.github.io/wheel/calc/ |

Калькулятор принимает параметры в ссылке, например меню с редким джекпотом при μ = 0,45:
[открыть](https://devmtsarev.github.io/wheel/calc/#items=5:30,10:30,20:25,50:14,2000:1&mu=0.45&delta=0.1&alpha=5&Nh=30&wmin=0&sigma=0.4&f=5&rho=3&c0=0.2&phi=0.3&eps=1.5&load=0.5).
Формат ссылки описан в [calc/README.md](calc/README.md).

## Папки

- `calc/` — модель цены (`model.js`), тесты, калькулятор, пакетный расчёт цены для меню разных моделей (`price.js`).
- `demo/` — демо виджета колеса.
- `docs/` — документ с математикой и графиками: `model.md`, страница `index.html`, `model.pdf`.

Страницы работают, пока репозиторий публичный и в Settings → Pages выбрана ветка `main`, папка `/ (root)`.
