// Кладём движок распознавания штрихкодов (ZXing, WebAssembly) в public/, чтобы сайт отдавал его сам,
// без загрузки с чужого CDN. Запускается автоматически после npm install.
import { copyFileSync, existsSync, mkdirSync } from "node:fs"

const from = "node_modules/zxing-wasm/dist/reader/zxing_reader.wasm"
if (existsSync(from)) {
  mkdirSync("public", { recursive: true })
  copyFileSync(from, "public/zxing_reader.wasm")
}
