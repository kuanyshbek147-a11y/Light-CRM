import assert from "node:assert/strict";
import test from "node:test";
import { guessContentType, isSafeUploadName, readStorageConfig } from "../modules/media/storage";

test("без ключей хранилище выключено — работаем только с диском", () => {
  assert.equal(readStorageConfig({}), null);
  assert.equal(readStorageConfig({ S3_BUCKET: "b", S3_ACCESS_KEY_ID: "k" }), null);
});

test("настройки R2: регион auto и префикс uploads по умолчанию", () => {
  const config = readStorageConfig({
    S3_ENDPOINT: "https://abc.r2.cloudflarestorage.com",
    S3_BUCKET: "lightcrm",
    S3_ACCESS_KEY_ID: "key",
    S3_SECRET_ACCESS_KEY: "secret"
  });
  assert.equal(config?.region, "auto");
  assert.equal(config?.prefix, "uploads");
  assert.equal(config?.endpoint, "https://abc.r2.cloudflarestorage.com");
});

test("отдаём только простые имена файлов", () => {
  assert.equal(isSafeUploadName("1790433784924-dd426f3f-photo.png"), true);
  assert.equal(isSafeUploadName("../.env"), false);
  assert.equal(isSafeUploadName("a/b.png"), false);
  assert.equal(isSafeUploadName(".hidden"), false);
});

test("тип файла по расширению", () => {
  assert.equal(guessContentType("x.JPG"), "image/jpeg");
  assert.equal(guessContentType("voice.ogg"), "audio/ogg");
  assert.equal(guessContentType("x.bin"), "application/octet-stream");
});
