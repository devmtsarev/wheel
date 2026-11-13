// Сборка: вставляет model.js в страницу. Запуск: node build.js
const fs = require('fs'), path = require('path'); const d = __dirname;
const model = fs.readFileSync(path.join(d, 'model.js'), 'utf8');
const page = fs.readFileSync(path.join(d, 'page.src.html'), 'utf8').replace('/*__MODEL__*/', () => model);
fs.writeFileSync(path.join(d, 'page.html'), page);
fs.writeFileSync(path.join(d, 'index.html'), '<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<style>body{margin:0}[hidden]{display:none!important}</style>\n</head>\n<body>\n' + page + '\n</body>\n</html>\n');
console.log('built page.html, index.html');
