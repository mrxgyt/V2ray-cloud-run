# V2Ray / Xray Config Panel

Веб-панель для генерации серверных конфигов и клиентских ссылок V2Ray / Xray.
**Сама панель прокси НЕ запускает** — она только генерирует `config.json` для вашего
сервера и share-ссылки (`vless://`, `vmess://`, `trojan://`) + QR для клиентов.

## Что умеет

- Протоколы: **VLESS, VMess, Trojan**
- Транспорты: **TCP, WebSocket, gRPC, HTTP/2, mKCP, QUIC**
- Безопасность: **none, TLS, REALITY** (XTLS Vision)
- Авто-генерация: UUID, Trojan-пароль, x25519-ключи REALITY, Short ID
- Хранение списка конфигов на диске (`data/configs.json`)
- Скачать серверный `config.json`, скопировать клиентскую ссылку, QR-код

## Стек

- Node.js 20 + Express
- Tailwind (CDN) + ванильный JS на фронте
- `qrcode` для QR
- Встроенный `crypto` для UUID и x25519

## Структура

```
server.js          # Express API + генерация конфигов/ссылок
public/index.html  # SPA-панель
data/configs.json  # хранилище (создаётся автоматически)
Dockerfile         # для Northflank / любого Docker-хостинга
```

## API

- `GET    /api/configs`              — список
- `POST   /api/configs`              — создать
- `PUT    /api/configs/:id`          — обновить
- `DELETE /api/configs/:id`          — удалить
- `GET    /api/configs/:id/server`   — серверный config.json (`?download=1` для файла)
- `GET    /api/configs/:id/link`     — share-ссылка + QR (data URL)
- `POST   /api/preview`              — предпросмотр без сохранения
- `POST   /api/x25519`               — пара ключей REALITY
- `POST   /api/uuid`                 — UUID v4
- `POST   /api/shortid`              — REALITY short id
- `GET    /healthz`                  — healthcheck

## Деплой на Northflank (через GitHub)

1. Запушить репозиторий на GitHub.
2. В Northflank: **Create new service → Deployment → from Git repo** → выбрать репо.
3. Build: **Dockerfile** (без указания пути — корень).
4. Port: `5000`, Protocol: HTTP, Public.
5. (Опционально) **Persistent volume** на `/app/data` — чтобы конфиги не терялись
   при ре-деплое.
6. Save → Northflank сам соберёт и поднимет.

После каждого `git push` Northflank пересоберёт сервис автоматически.

## Локальный запуск (вне Replit)

```bash
npm install
npm start
# открыть http://localhost:5000
```

## Заметки по безопасности

- Панель без авторизации — **не выкладывайте её на публичный URL без защиты**.
  Прячьте за приватной сетью Northflank, либо добавьте Basic Auth в Express
  (это можно дописать позже).
- `data/configs.json` содержит все ключи и UUID — не коммитьте его (он в `.gitignore`).
- Для REALITY не забудьте раздать клиенту: **publicKey** (не private), **shortId**, **SNI**, **fingerprint**.

## Изменения

- Стартовый коммит: V2Ray-прокси (удалён) заменён на эту панель.
