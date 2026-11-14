const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");

const {
  detectRoomImage,
  validateRoomImage,
  getManagedRoomImageFilename
} = require("../utils/room-image");

test("detects JPEG, PNG, and WebP signatures", () => {
  assert.deepEqual(
    detectRoomImage(Buffer.from([0xff, 0xd8, 0xff, 0x00])),
    { extension: "jpg", mimeType: "image/jpeg" }
  );
  assert.deepEqual(
    detectRoomImage(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    ),
    { extension: "png", mimeType: "image/png" }
  );
  assert.deepEqual(
    detectRoomImage(Buffer.from("RIFF0000WEBP")),
    { extension: "webp", mimeType: "image/webp" }
  );
});

test("rejects unsupported, truncated, and MIME-mismatched images", () => {
  assert.equal(detectRoomImage(Buffer.from("not an image")), null);
  assert.equal(detectRoomImage(Buffer.from([0xff, 0xd8])), null);
  assert.equal(
    validateRoomImage(Buffer.from([0xff, 0xd8, 0xff]), "image/png"),
    null
  );
  assert.equal(
    validateRoomImage(Buffer.from([0xff, 0xd8, 0xff]), "application/octet-stream"),
    null
  );
});

test("only accepts generated room image paths for file cleanup", () => {
  assert.equal(
    getManagedRoomImageFilename("/uploads/rooms/0123456789abcdef0123456789abcdef.jpg"),
    "0123456789abcdef0123456789abcdef.jpg"
  );
  assert.equal(
    getManagedRoomImageFilename("/uploads/rooms/../../backend/.env"),
    null
  );
  assert.equal(
    getManagedRoomImageFilename("https://example.test/room.png"),
    null
  );
});

const serverPath = path.join(__dirname, "../server.js");
const serverSource = fs.readFileSync(serverPath, "utf8");
const persistenceStart = serverSource.indexOf(
  "async function getRoomImageState(roomId) {"
);
const persistenceEnd = serverSource.indexOf(
  "// ดูรายการห้องทั้งหมด",
  persistenceStart
);

if (persistenceStart < 0 || persistenceEnd < 0) {
  throw new Error("Room image persistence functions were not found in server.js");
}

const persistenceSource = serverSource.slice(persistenceStart, persistenceEnd);

function loadPersistenceFunctions(
  adminRoomDb,
  directory,
  fileSystem,
  logger,
  cryptoModule = crypto
) {
  const module = { exports: {} };

  vm.runInNewContext(
    `${persistenceSource}\nmodule.exports = {
      saveRoomImage,
      clearRoomImage,
      removeRoomImageIfUnused,
      getRoomImageCleanupWarning
    };`,
    {
      module,
      adminRoomDb,
      ROOM_IMAGE_DIRECTORY: directory,
      crypto: cryptoModule,
      fs: fileSystem,
      path,
      getManagedRoomImageFilename,
      console: logger
    },
    { filename: serverPath }
  );

  return module.exports;
}

function createFileSystem(
  open = (...args) => fs.promises.open(...args),
  unlink = (...args) => fs.promises.unlink(...args)
) {
  return {
    promises: {
      mkdir: (...args) => fs.promises.mkdir(...args),
      open,
      unlink
    }
  };
}

async function createPersistenceHarness(options = {}) {
  const directory = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "bookingcstu-room-image-")
  );
  const errors = [];
  const warnings = [];
  let connectionCount = 0;
  let databaseImageUrl = options.initialImageUrl ?? null;

  function createConnection() {
    const connectionId = ++connectionCount;
    let pendingImageUrl = databaseImageUrl;
    let transactionActive = false;
    const connection = {
      destroyed: false,
      released: false,
      async beginTransaction() {
        transactionActive = true;
        pendingImageUrl = databaseImageUrl;
      },
      async execute(sql, parameters = []) {
        if (sql.includes("FOR UPDATE")) {
          return [[{ room_id: 7, image_url: databaseImageUrl }], []];
        }

        if (sql.includes("SET image_url = NULL")) {
          if (options.failDeleteUpdate) {
            throw new Error("simulated delete update failure");
          }

          pendingImageUrl = null;
          return [{ affectedRows: 1 }, []];
        }

        if (sql.includes("SET image_url = ?")) {
          pendingImageUrl = parameters[0];
          if (options.failImageUpdate) {
            if (options.applyImageUpdateBeforeError) {
              databaseImageUrl = pendingImageUrl;
              transactionActive = false;
            }
            throw new Error("simulated image update failure");
          }

          return [{ affectedRows: 1 }, []];
        }

        if (sql.startsWith("SELECT * FROM rooms")) {
          if (connectionId > 1 && options.failVerification) {
            throw new Error("simulated verification failure");
          }

          return [[{
            room_id: 7,
            room_code: "TEST-ROOM",
            image_url:
              connectionId === 1 && transactionActive
                ? pendingImageUrl
                : databaseImageUrl
          }], []];
        }

        throw new Error(`Unexpected mocked query: ${sql}`);
      },
      async commit() {
        if (options.commitError) {
          if (options.commitApplies) {
            databaseImageUrl = pendingImageUrl;
            transactionActive = false;
          }
          throw new Error("simulated commit failure");
        }

        databaseImageUrl = pendingImageUrl;
        transactionActive = false;
      },
      async rollback() {
        if (options.rollbackFails) {
          if (options.rollbackApplies) {
            databaseImageUrl = pendingImageUrl;
            transactionActive = false;
          }
          throw new Error("simulated rollback failure");
        }

        transactionActive = false;
        pendingImageUrl = databaseImageUrl;
      },
      destroy() {
        this.destroyed = true;
        if (transactionActive) {
          transactionActive = false;
          pendingImageUrl = databaseImageUrl;
        }
      },
      release() {
        this.released = true;
      }
    };

    return connection;
  }

  const adminRoomDb = {
    async getConnection() {
      if (connectionCount > 0 && options.failVerification) {
        throw new Error("simulated verification connection failure");
      }
      return createConnection();
    },
    async execute(sql, parameters = []) {
      if (sql.includes("image_usage_count")) {
        if (options.failCleanupCount) {
          throw new Error("simulated cleanup query failure");
        }

        return [[{
          image_usage_count: databaseImageUrl === parameters[0] ? 1 : 0
        }], []];
      }

      throw new Error(`Unexpected mocked pool query: ${sql}`);
    }
  };

  const functions = loadPersistenceFunctions(
    adminRoomDb,
    directory,
    createFileSystem(options.open, options.unlink),
    {
      error: (...args) => errors.push(args),
      warn: (...args) => warnings.push(args)
    },
    options.crypto || crypto
  );

  return {
    ...functions,
    directory,
    errors,
    warnings,
    get databaseImageUrl() {
      return databaseImageUrl;
    },
    async cleanup() {
      await fs.promises.rm(directory, { recursive: true, force: true });
    }
  };
}

const testImage = {
  buffer: Buffer.from("temporary room image"),
  mimetype: "image/png"
};
const pngFormat = { extension: "png", mimeType: "image/png" };

function imageFilePath(harness, imageUrl) {
  return path.join(harness.directory, path.basename(imageUrl));
}

function assertRejectsWith(promise, message) {
  return assert.rejects(promise, error => error.message === message);
}

test("saves a room image and commits its URL", async t => {
  const harness = await createPersistenceHarness();
  t.after(() => harness.cleanup());

  const saved = await harness.saveRoomImage(7, testImage, pngFormat);

  assert.equal(harness.databaseImageUrl, saved.imageUrl);
  assert.equal(
    await fs.promises.readFile(imageFilePath(harness, saved.imageUrl), "utf8"),
    testImage.buffer.toString()
  );
});

test("removes a partial file write without touching other files", async t => {
  const harness = await createPersistenceHarness({
    open: async (filePath, flags) => {
      const handle = await fs.promises.open(filePath, flags);
      return {
        writeFile: async buffer => {
          await handle.writeFile(buffer.subarray(0, 4));
          throw new Error("simulated partial write failure");
        },
        close: () => handle.close()
      };
    }
  });
  t.after(() => harness.cleanup());
  const unrelatedFile = path.join(harness.directory, "keep.txt");
  await fs.promises.writeFile(unrelatedFile, "keep");

  await assertRejectsWith(
    harness.saveRoomImage(7, testImage, pngFormat),
    "simulated partial write failure"
  );

  assert.deepEqual((await fs.promises.readdir(harness.directory)).sort(), [
    "keep.txt"
  ]);
  assert.equal(harness.databaseImageUrl, null);
});

test("does not remove an existing file when exclusive creation collides", async t => {
  const filename = `${"1".repeat(32)}.png`;
  const imageUrl = `/uploads/rooms/${filename}`;
  const harness = await createPersistenceHarness({
    initialImageUrl: imageUrl,
    crypto: {
      randomBytes: () => Buffer.from("1".repeat(32), "hex")
    }
  });
  t.after(() => harness.cleanup());
  const existingFile = imageFilePath(harness, imageUrl);
  await fs.promises.writeFile(existingFile, "existing image");

  await assert.rejects(
    harness.saveRoomImage(7, testImage, pngFormat),
    error => error.code === "EEXIST"
  );

  assert.equal(harness.databaseImageUrl, imageUrl);
  assert.equal(await fs.promises.readFile(existingFile, "utf8"), "existing image");
});

test("cleans up the new image when update fails and rollback succeeds", async t => {
  const previousUrl = `/uploads/rooms/${"a".repeat(32)}.png`;
  const harness = await createPersistenceHarness({
    initialImageUrl: previousUrl,
    failImageUpdate: true
  });
  t.after(() => harness.cleanup());

  await assertRejectsWith(
    harness.saveRoomImage(7, testImage, pngFormat),
    "simulated image update failure"
  );

  assert.equal(harness.databaseImageUrl, previousUrl);
  assert.deepEqual(await fs.promises.readdir(harness.directory), []);
});

test("preserves the new image when rollback fails and DB references it", async t => {
  const harness = await createPersistenceHarness({
    failImageUpdate: true,
    applyImageUpdateBeforeError: true,
    rollbackFails: true,
    rollbackApplies: true
  });
  t.after(() => harness.cleanup());

  const saved = await harness.saveRoomImage(7, testImage, pngFormat);

  assert.equal(harness.databaseImageUrl, saved.imageUrl);
  await fs.promises.access(imageFilePath(harness, saved.imageUrl));
});

test("cleans up after rollback failure when DB confirms the new URL is absent", async t => {
  const previousUrl = `/uploads/rooms/${"b".repeat(32)}.png`;
  const harness = await createPersistenceHarness({
    initialImageUrl: previousUrl,
    failImageUpdate: true,
    rollbackFails: true
  });
  t.after(() => harness.cleanup());

  await assertRejectsWith(
    harness.saveRoomImage(7, testImage, pngFormat),
    "simulated image update failure"
  );

  assert.equal(harness.databaseImageUrl, previousUrl);
  assert.deepEqual(await fs.promises.readdir(harness.directory), []);
});

test("preserves the new image if DB state cannot be verified", async t => {
  const harness = await createPersistenceHarness({
    failImageUpdate: true,
    rollbackFails: true,
    failVerification: true
  });
  t.after(() => harness.cleanup());

  await assertRejectsWith(
    harness.saveRoomImage(7, testImage, pngFormat),
    "simulated image update failure"
  );

  assert.equal(await fs.promises.readdir(harness.directory).then(files => files.length), 1);
  assert.equal(harness.databaseImageUrl, null);
});

test("treats a commit error as success when a fresh DB connection finds the new URL", async t => {
  const harness = await createPersistenceHarness({
    commitError: true,
    commitApplies: true
  });
  t.after(() => harness.cleanup());

  const saved = await harness.saveRoomImage(7, testImage, pngFormat);

  assert.equal(harness.databaseImageUrl, saved.imageUrl);
  await fs.promises.access(imageFilePath(harness, saved.imageUrl));
});

test("cleans up after a commit error when a fresh DB connection confirms rollback", async t => {
  const harness = await createPersistenceHarness({ commitError: true });
  t.after(() => harness.cleanup());

  await assertRejectsWith(
    harness.saveRoomImage(7, testImage, pngFormat),
    "simulated commit failure"
  );

  assert.equal(harness.databaseImageUrl, null);
  assert.deepEqual(await fs.promises.readdir(harness.directory), []);
});

test("replaces an image before removing the old unreferenced file", async t => {
  const previousUrl = `/uploads/rooms/${"c".repeat(32)}.png`;
  const harness = await createPersistenceHarness({ initialImageUrl: previousUrl });
  t.after(() => harness.cleanup());
  const previousFile = imageFilePath(harness, previousUrl);
  await fs.promises.writeFile(previousFile, "old image");

  const saved = await harness.saveRoomImage(7, testImage, pngFormat);
  await harness.removeRoomImageIfUnused(saved.previousImageUrl);

  assert.equal(harness.databaseImageUrl, saved.imageUrl);
  await fs.promises.access(imageFilePath(harness, saved.imageUrl));
  await assert.rejects(fs.promises.access(previousFile), { code: "ENOENT" });
});

test("warns when old-file cleanup fails without losing the replacement", async t => {
  const previousUrl = `/uploads/rooms/${"9".repeat(32)}.png`;
  const harness = await createPersistenceHarness({
    initialImageUrl: previousUrl,
    unlink: async () => {
      throw new Error("simulated unlink failure");
    }
  });
  t.after(() => harness.cleanup());
  const previousFile = imageFilePath(harness, previousUrl);
  await fs.promises.writeFile(previousFile, "old image");

  const saved = await harness.saveRoomImage(7, testImage, pngFormat);
  const warning = await harness.getRoomImageCleanupWarning(
    saved.previousImageUrl,
    "test cleanup warning"
  );

  assert.equal(warning, "บันทึกข้อมูลแล้ว แต่ไม่สามารถลบไฟล์รูปเดิมได้");
  assert.equal(harness.databaseImageUrl, saved.imageUrl);
  await fs.promises.access(previousFile);
  await fs.promises.access(imageFilePath(harness, saved.imageUrl));
});

test("clears the image URL before deleting the old file", async t => {
  const previousUrl = `/uploads/rooms/${"d".repeat(32)}.png`;
  const harness = await createPersistenceHarness({ initialImageUrl: previousUrl });
  t.after(() => harness.cleanup());
  const previousFile = imageFilePath(harness, previousUrl);
  await fs.promises.writeFile(previousFile, "old image");

  const cleared = await harness.clearRoomImage(7);
  await harness.removeRoomImageIfUnused(cleared.previousImageUrl);

  assert.equal(harness.databaseImageUrl, null);
  await assert.rejects(fs.promises.access(previousFile), { code: "ENOENT" });
});

test("does not delete the old file when deleting its DB URL fails", async t => {
  const previousUrl = `/uploads/rooms/${"e".repeat(32)}.png`;
  const harness = await createPersistenceHarness({
    initialImageUrl: previousUrl,
    failDeleteUpdate: true
  });
  t.after(() => harness.cleanup());
  const previousFile = imageFilePath(harness, previousUrl);
  await fs.promises.writeFile(previousFile, "old image");

  await assertRejectsWith(
    harness.clearRoomImage(7),
    "simulated delete update failure"
  );

  assert.equal(harness.databaseImageUrl, previousUrl);
  await fs.promises.access(previousFile);
});

test("confirms an ambiguous delete commit before removing the old file", async t => {
  const previousUrl = `/uploads/rooms/${"f".repeat(32)}.png`;
  const harness = await createPersistenceHarness({
    initialImageUrl: previousUrl,
    commitError: true,
    commitApplies: true
  });
  t.after(() => harness.cleanup());
  const previousFile = imageFilePath(harness, previousUrl);
  await fs.promises.writeFile(previousFile, "old image");

  const cleared = await harness.clearRoomImage(7);
  await harness.removeRoomImageIfUnused(cleared.previousImageUrl);

  assert.equal(harness.databaseImageUrl, null);
  await assert.rejects(fs.promises.access(previousFile), { code: "ENOENT" });
});
