# Колесо призов

Виджет «колесо призов» для вебкам-платформы: демо виджета, модель цены вращения с документом и калькулятор.

## Страницы

| Что | Ссылка |
| --- | --- |
| Демо интеграции: зритель, оператор, управление и сценарии цены | [experience/demos/](experience/demos/index.html) (после публикации: https://devmtsarev.github.io/wheel/experience/demos/) |
| Демо колеса | https://devmtsarev.github.io/wheel/demo/ |
| Документ с моделью цены | https://devmtsarev.github.io/wheel/docs/ |
| Документ в PDF | https://devmtsarev.github.io/wheel/docs/model.pdf |
| Калькулятор цены вращения | https://devmtsarev.github.io/wheel/calc/ |

Калькулятор принимает параметры в ссылке, например меню с редким джекпотом при μ = 0,45:
[открыть](https://devmtsarev.github.io/wheel/calc/#items=5:30,10:30,20:25,50:14,2000:1&mu=0.45&delta=0.1&alpha=5&Nh=30&wmin=0&sigma=0.4&f=5&rho=3&c0=0.2&phi=0.3&eps=1.5&load=0.5).
Формат ссылки описан в [calc/README.md](calc/README.md).

## Папки

- `api/` — описание API: `openapi.yaml` (OpenAPI 3.1), в `api/README.md` — подпись запросов, порядок вращения, вебхуки и WebSocket.
- `calc/` — модель цены (`model.js`), тесты, калькулятор, пакетный расчёт цены для меню разных моделей (`price.js`).
- `demo/` — демо виджета колеса.
- `docs/` — документ с математикой и графиками: `model.md`, страница `index.html`, `model.pdf`.

Страницы работают, пока репозиторий публичный и в Settings → Pages выбрана ветка `main`, папка `/ (root)`.

## Integration & UI prototype

The new [`experience/`](experience/README.md) implements three separate views:

- **Player:** embeddable wheel overlay on a sample host website.
- **Stream operator:** live prize queue, pause/resume, completion and demo refunds.
- **Management:** separate dashboard with spending, win rates, reporting, price versions and embed setup.

Run `python3 -m http.server 8774 --bind 127.0.0.1` from the repository and open `http://127.0.0.1:8774/experience/`. The views synchronize in the same browser through local storage. This prototype uses demo tokens and has no production authentication or payment integration.


### Demonstration and checks

Open [`experience/demos/`](experience/demos/index.html) for the three-view walkthrough, screenshots and four interactive pricing scenarios. It runs as static files on localhost or GitHub Pages, like the original demo. The pricing sandbox does not alter the active wallet/menu.

```sh
node --test calc/model.test.js experience/shared/store.test.mjs experience/embed/wheel.test.mjs
```

See [changes and demo verification](experience/CHANGES.md). The new automatic inverse-price model is separate from the original `calc/` model and the server contract in `api/`; this PR does not implement that backend.
