# Исходники картинок для лендинга «Прорыв — лето для репетитора»

В runtime эти файлы НЕ используются — они запечены как `data:image/png;base64,…`
прямо в [public/landings/prrv-summer.html](../../prrv-summer.html) (как в `prepodavay-tg.html`).

Здесь они лежат на случай **пересборки**: если поменялся ассет, замените файл,
после чего перегенерируйте base64-блоки в HTML:

```bash
python3 << 'EOF'
import base64
ASSETS = {
  'logo.png': 'public/landings/assets/prrv-summer/logo.png',
  'author.png': 'public/landings/assets/prrv-summer/author.png',
  'qr.png': 'public/landings/assets/prrv-summer/qr.png',
  'wordstat-strip.png': 'public/landings/assets/prrv-summer/wordstat-strip.png',
}
# ... см. историю команд — это та же команда, что использовалась при первой сборке
EOF
```

## Что где используется

| Файл                  | Где в HTML                                |
|-----------------------|-------------------------------------------|
| `logo.png`            | Hero, правый верхний угол                 |
| `author.png`          | Секция «Обо мне», аватар-круг             |
| `qr.png`              | Финальный CTA — целостный модуль QR       |
| `wordstat-strip.png`  | Секция «Спрос летом есть», одна полоса    |
